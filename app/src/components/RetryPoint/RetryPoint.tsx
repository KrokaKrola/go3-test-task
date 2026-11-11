'use client';

import { useEffect, useRef, useState } from 'react';
import type { ApiErrorKind } from '@/api/errors/errors';
import type { RetryMessages } from '@/components/RetryPoint/retryMessages/retryMessages';
import { StepScreen } from '@/components/eid/StepScreen/StepScreen';
import type { Notice, RetryView } from '@/flow/machine/machine';
import { NOTICE_PARAM, noticeFromSearch, removeUrlParam } from '@/flow/notice/notice';
import styles from './RetryPoint.module.css';

type Props = {
  messages: RetryMessages;
  view: RetryView;
  // Title of the chosen plan; null when the context holds none.
  planTitle: string | null;
  // Plans as retry point (reviewStep off): shows the chosen plan and Try again (Q38).
  canRetry: boolean;
  // The Gate is running: Try again stays, aria-disabled, so focus is not lost (08).
  busy?: boolean;
  onTryAgain: () => void;
  onCheckAgain: () => void;
};

const errorText = (messages: RetryMessages, kind: ApiErrorKind) =>
  kind === 'network' ? messages['retry.error.network'] : messages['retry.error.other'];

export function RetryPoint({
  messages,
  view,
  planTitle,
  canRetry,
  busy = false,
  onTryAgain,
  onCheckAgain,
}: Props) {
  // Read once on mount; the machine's own notice (in-page failure) wins.
  const [urlNotice] = useState<Notice | null>(() => noticeFromSearch(window.location.search));
  useEffect(() => removeUrlParam(NOTICE_PARAM), []);

  const notice = view.notice ?? urlNotice;
  const noticeText = notice ? messages[`retry.notice.${notice}`] : null;
  const errorMessage = view.errorKind ? errorText(messages, view.errorKind) : null;
  const bannerRef = useRef<HTMLDivElement>(null);
  const hasBanner = Boolean(noticeText ?? errorMessage);
  useEffect(() => {
    if (hasBanner) bannerRef.current?.focus();
  }, [hasBanner, noticeText, errorMessage]);

  const showRetry = canRetry && notice !== 'plan_unavailable';
  if (!hasBanner) return null;
  return (
    <section className={styles.retryPoint}>
      <div ref={bannerRef} role="alert" tabIndex={-1} className={styles.banner}>
        {noticeText && <p>{noticeText}</p>}
        {errorMessage && <p>{errorMessage}</p>}
      </div>
      {showRetry && (
        <>
          {planTitle && (
            <p>
              {messages['retry.selectedPlan']} <strong>{planTitle}</strong>
            </p>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.action}
              disabled={view.payDisabled}
              aria-disabled={busy || undefined}
              onClick={busy ? undefined : onTryAgain}
            >
              {busy ? messages['retry.busy'] : messages['retry.action.tryAgain']}
            </button>
            {view.payDisabled && (
              <button type="button" className={styles.action} onClick={onCheckAgain}>
                {messages['retry.action.checkAgain']}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// Resume (04 Gate): an open order is pending. Only "Check status" in the slice.
export function Resume({
  messages,
  onCheckStatus,
}: {
  messages: RetryMessages;
  onCheckStatus: () => void;
}) {
  return (
    <StepScreen
      title={messages['retry.resume.title']}
      actions={[{ label: messages['retry.action.checkStatus'], onClick: onCheckStatus }]}
    >
      <p>{messages['retry.resume.body']}</p>
    </StepScreen>
  );
}
