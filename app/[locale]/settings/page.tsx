'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft, Trash2, Shield } from 'lucide-react';
import DataDeletionModal from '@/components/player/DataDeletionModal';
import { useWallet } from '@/hooks/useWallet';

export default function SettingsPage({
  params,
}: {
  params: { locale: string };
}) {
  const locale = params.locale;
  const t = useTranslations('settings');
  const { isAuthenticated } = useWallet();
  const [showDeletionModal, setShowDeletionModal] = useState(false);

  return (
    <div className="flex flex-col gap-10 pb-20">
      {/* Header */}
      <section className="relative overflow-hidden rounded-2xl border border-gray-800 bg-brand-card px-6 py-10 sm:px-8 lg:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(0,200,83,0.12),_transparent_50%)]" />
        <div className="relative flex flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-green/30 bg-brand-green/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-brand-green">
            <Shield size={12} />
            {t('eyebrow')}
          </span>
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold text-white sm:text-4xl">
              {t('page_title')}
            </h1>
            <p className="mt-3 text-sm leading-7 text-gray-400 sm:text-base">
              {t('page_description')}
            </p>
          </div>
          <div className="flex justify-start">
            <Link
              href={`/${locale}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-brand-green transition hover:text-green-400"
            >
              {t('back_to_home')}
              <ArrowLeft size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* Data Deletion section */}
      <section className="px-1 sm:px-0">
        <div className="rounded-2xl border border-gray-800 bg-brand-card/70 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
                <Trash2 size={18} aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {t('data_deletion_title')}
                </h2>
                <p className="mt-1 max-w-lg text-sm leading-relaxed text-gray-400">
                  {t('data_deletion_description')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowDeletionModal(true)}
              disabled={!isAuthenticated}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-5 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 size={15} />
              {t('data_deletion_button')}
            </button>
          </div>

          {!isAuthenticated && (
            <p className="mt-4 text-xs text-gray-500">
              {t('connect_wallet_to_request')}
            </p>
          )}
        </div>
      </section>

      <DataDeletionModal
        isOpen={showDeletionModal}
        onClose={() => setShowDeletionModal(false)}
      />
    </div>
  );
}
