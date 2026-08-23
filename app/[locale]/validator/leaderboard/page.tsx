import { Suspense } from 'react';
import { getLeaderboardData } from './data';
import LeaderboardContent from './LeaderboardContent';
import LeaderboardLoading from './loading';

export const revalidate = 300;

export default async function ValidatorLeaderboardPage() {
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Validator Leaderboard</h1>
        <p className="text-gray-400 text-sm mt-1">
          Validators ranked by total approved milestones. Anyone can view this
          page — no wallet connection required.
        </p>
      </div>

      <Suspense fallback={<LeaderboardLoading />}>
        <LeaderboardData />
      </Suspense>
    </div>
  );
}

async function LeaderboardData() {
  const entries = await getLeaderboardData();
  return <LeaderboardContent entries={entries} />;
}
