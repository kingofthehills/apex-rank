import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface LeaderboardEntry {
  rank: number;
  user_id: number;
  username: string;
  total_score: number;
  last_updated: string;
}

interface PlayerRank {
  user_id: number;
  username: string;
  total_score: number;
  rank: number;
}

interface SeedStatus {
  users: number;
  game_sessions: number;
  leaderboard: number;
}

const Index = () => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [playerRank, setPlayerRank] = useState<PlayerRank | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [seedStatus, setSeedStatus] = useState<SeedStatus | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedProgress, setSeedProgress] = useState("");
  const [submitUserId, setSubmitUserId] = useState("");
  const [submitScore, setSubmitScore] = useState("");
  const [submitResult, setSubmitResult] = useState("");

  const fetchLeaderboard = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("leaderboard")
        .select("user_id, total_score, rank, last_updated, users(username)")
        .gt("rank", 0)
        .order("rank", { ascending: true })
        .limit(10);

      if (error) throw error;

      const result = (data || []).map((row: any) => ({
        rank: row.rank,
        user_id: row.user_id,
        username: row.users?.username,
        total_score: row.total_score,
        last_updated: row.last_updated,
      }));
      setLeaderboard(result);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
    }
  }, []);

  const fetchSeedStatus = useCallback(async () => {
    try {
      const [u, g, l] = await Promise.all([
        supabase.from("users").select("*", { count: "exact", head: true }),
        supabase.from("game_sessions").select("*", { count: "exact", head: true }),
        supabase.from("leaderboard").select("*", { count: "exact", head: true }),
      ]);
      setSeedStatus({
        users: u.count ?? 0,
        game_sessions: g.count ?? 0,
        leaderboard: l.count ?? 0,
      });
    } catch (err) {
      console.error("Failed to fetch status:", err);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    fetchSeedStatus();
    const interval = setInterval(fetchLeaderboard, 10000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard, fetchSeedStatus]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("leaderboard-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "leaderboard" }, () => {
        fetchLeaderboard();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchLeaderboard]);

  const searchPlayer = async () => {
    if (!playerSearch.trim()) return;
    setLoading(true);
    setSearchError("");
    setPlayerRank(null);
    try {
      const { data, error } = await supabase.rpc("get_player_rank", {
        p_user_id: parseInt(playerSearch.trim()),
      });
      if (error) throw error;
      if (!data || data.length === 0) {
        setSearchError("Player not found");
      } else {
        setPlayerRank(data[0]);
      }
    } catch (err: any) {
      setSearchError(err.message || "Failed to search");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitScore = async () => {
    if (!submitUserId || !submitScore) return;
    setSubmitResult("");
    try {
      const { data, error } = await supabase.rpc("submit_score", {
        p_user_id: parseInt(submitUserId),
        p_score: parseInt(submitScore),
        p_game_mode: "classic",
      });
      if (error) throw error;
      const result = data[0];
      setSubmitResult(`✓ Total: ${result.new_total_score} | Rank: #${result.current_rank}`);
      fetchLeaderboard();
    } catch (err: any) {
      setSubmitResult(`✗ ${err.message}`);
    }
  };

  const seedDatabase = async () => {
    setSeeding(true);
    const batchSize = 50000;
    try {
      for (let offset = 0; offset < 1000000; offset += batchSize) {
        setSeedProgress(`Seeding users: ${offset.toLocaleString()} / 1,000,000`);
        const { error } = await supabase.rpc("seed_users_batch", { p_offset: offset, p_batch_size: batchSize });
        if (error) throw error;
      }

      for (let offset = 0; offset < 5000000; offset += batchSize) {
        setSeedProgress(`Seeding sessions: ${offset.toLocaleString()} / 5,000,000`);
        const { error } = await supabase.rpc("seed_sessions_batch", { p_offset: offset, p_batch_size: batchSize });
        if (error) throw error;
      }

      setSeedProgress("Refreshing leaderboard...");
      const { error } = await supabase.rpc("refresh_leaderboard", { top_n: 100 });
      if (error) throw error;

      setSeedProgress("✓ Seeding complete!");
      fetchSeedStatus();
      fetchLeaderboard();
    } catch (err: any) {
      setSeedProgress(`✗ Error: ${err.message}`);
    } finally {
      setSeeding(false);
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Badge className="bg-primary text-primary-foreground font-bold">🥇 #1</Badge>;
    if (rank === 2) return <Badge className="bg-secondary text-secondary-foreground font-bold">🥈 #2</Badge>;
    if (rank === 3) return <Badge className="bg-accent text-accent-foreground font-bold">🥉 #3</Badge>;
    return <Badge variant="outline">#{rank}</Badge>;
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-foreground">🎮 Gaming Leaderboard</h1>
        <p className="text-muted-foreground mt-1">High-performance system • Auto-refreshes every 10s • pg_cron background refresh</p>
      </header>

      <div className="max-w-5xl mx-auto grid gap-6">
        {/* Database Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Database Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="text-sm">
                <span className="text-muted-foreground">Users:</span>{" "}
                <span className="font-mono font-bold">{seedStatus?.users?.toLocaleString() ?? "—"}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Sessions:</span>{" "}
                <span className="font-mono font-bold">{seedStatus?.game_sessions?.toLocaleString() ?? "—"}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Leaderboard:</span>{" "}
                <span className="font-mono font-bold">{seedStatus?.leaderboard?.toLocaleString() ?? "—"}</span>
              </div>
              <Button onClick={fetchSeedStatus} variant="outline" size="sm">Refresh Status</Button>
              <Button onClick={seedDatabase} disabled={seeding} size="sm">
                {seeding ? "Seeding..." : "Seed 1M Users + 5M Sessions"}
              </Button>
            </div>
            {seedProgress && <p className="text-sm mt-2 font-mono text-muted-foreground">{seedProgress}</p>}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Top 10 Leaderboard */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">🏆 Top 10 Players</CardTitle>
                <span className="text-xs text-muted-foreground">
                  Updated: {lastRefresh.toLocaleTimeString()}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {leaderboard.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No data yet. Seed the database first.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Rank</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead className="text-right">Total Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboard.map((entry) => (
                      <TableRow key={entry.user_id}>
                        <TableCell>{getRankBadge(entry.rank)}</TableCell>
                        <TableCell className="font-medium">{entry.username}</TableCell>
                        <TableCell className="text-right font-mono">{entry.total_score.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Right sidebar */}
          <div className="space-y-6">
            {/* Player Rank Search */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">🔍 Player Rank</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="User ID (e.g. 42)"
                    value={playerSearch}
                    onChange={(e) => setPlayerSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchPlayer()}
                  />
                  <Button onClick={searchPlayer} disabled={loading} size="sm">Search</Button>
                </div>
                {searchError && <p className="text-sm text-destructive">{searchError}</p>}
                {playerRank && (
                  <div className="p-3 rounded-md border bg-muted/50 space-y-1">
                    <p className="font-medium">{playerRank.username}</p>
                    <p className="text-sm text-muted-foreground">Rank: <span className="font-bold text-foreground">#{playerRank.rank}</span></p>
                    <p className="text-sm text-muted-foreground">Score: <span className="font-mono text-foreground">{playerRank.total_score.toLocaleString()}</span></p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Submit Score */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">📤 Submit Score</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="User ID" value={submitUserId} onChange={(e) => setSubmitUserId(e.target.value)} />
                <Input placeholder="Score" type="number" value={submitScore} onChange={(e) => setSubmitScore(e.target.value)} />
                <Button onClick={handleSubmitScore} className="w-full" size="sm">Submit</Button>
                {submitResult && <p className="text-sm font-mono">{submitResult}</p>}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Architecture Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">⚙️ Architecture</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>
                <h4 className="font-semibold text-foreground mb-1">Database Optimization</h4>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>BIGINT identity columns for 1M+ scale</li>
                  <li>Composite index on (user_id, score) for aggregation</li>
                  <li>Partial index on rank for top-N queries</li>
                  <li>Materialized leaderboard table avoids full scans</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">Concurrency & Caching</h4>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Atomic score submission via DB function (transaction)</li>
                  <li>pg_cron refreshes top 100 every 10 seconds</li>
                  <li>Realtime subscriptions for instant UI updates</li>
                  <li>RLS policies for secure public read access</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
