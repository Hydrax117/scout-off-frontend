import type { TourStep } from '@/hooks/useOnboardingTour';

export const SCOUT_TOUR_ID = 'scout_dashboard';
export const PLAYER_TOUR_ID = 'player_dashboard';

export const scoutTourSteps: TourStep[] = [
  {
    id: 'scout-welcome',
    title: 'Welcome to Scout Dashboard',
    description:
      'Find and evaluate players from across the world. Start by connecting your wallet and setting up your subscription.',
    targetSelector: 'h1',
    position: 'bottom',
  },
  {
    id: 'scout-wallet',
    title: 'Connect Your Wallet',
    description:
      'Your wallet securely stores your identity and subscription details. Make sure to connect it to get started.',
    targetSelector: '[data-tour="wallet-button"]',
    position: 'bottom',
  },
  {
    id: 'scout-subscription',
    title: 'Manage Your Subscription',
    description:
      'Your current subscription tier and remaining days are shown here. Renew before it expires to keep browsing.',
    targetSelector: '[data-tour="subscription-status"]',
    position: 'bottom',
  },
  {
    id: 'scout-search',
    title: 'Search Players',
    description:
      'Search by wallet address or player name to find specific scouts. Use filters to narrow down your results.',
    targetSelector: '[data-tour="search-section"]',
    position: 'bottom',
  },
  {
    id: 'scout-filter',
    title: 'Filter & Discover',
    description:
      'Use position, region, and other filters to discover players that match your criteria. You can now explore the dashboard.',
    targetSelector: '[data-tour="filter-section"]',
    position: 'top',
  },
];

export const playerTourSteps: TourStep[] = [
  {
    id: 'player-welcome',
    title: 'Welcome to Player Dashboard',
    description:
      'Showcase your achievements and build your professional profile. Start by connecting your wallet.',
    targetSelector: 'h1',
    position: 'bottom',
  },
  {
    id: 'player-wallet',
    title: 'Connect Your Wallet',
    description:
      'Your wallet is your identity on the blockchain. Connect it to register as a player and track your progress.',
    targetSelector: '[data-tour="wallet-button"]',
    position: 'bottom',
  },
  {
    id: 'player-registration',
    title: 'Register as a Player',
    description:
      'Complete your profile with your details and experience. This helps scouts discover you.',
    targetSelector: '[data-tour="registration-section"]',
    position: 'bottom',
  },
  {
    id: 'player-progress',
    title: 'Understand Progress Levels',
    description:
      'Your progress bar shows your registration status. Complete all sections to reach 100% and maximize visibility.',
    targetSelector: '[data-tour="progress-section"]',
    position: 'bottom',
  },
  {
    id: 'player-milestones',
    title: 'Track Your Milestones',
    description:
      'Record your achievements and milestones over time. This builds your credibility with scouts and teams.',
    targetSelector: '[data-tour="milestones-section"]',
    position: 'top',
  },
];
