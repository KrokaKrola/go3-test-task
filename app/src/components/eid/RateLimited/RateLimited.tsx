'use client';

import { useEffect, useRef, useState } from 'react';
import { LiveRegion } from '@/components/LiveRegion/LiveRegion';
import { StepScreen } from '@/components/eid/StepScreen/StepScreen';
import type { EidMessages } from '@/components/eid/eidMessages/eidMessages';
import type { Locale } from '@/domain/locale/locale';
import { pluralForm } from '@/i18n/plural/plural';

type Props = {
  messages: EidMessages;
  locale: Locale;
  retryAfterSec: number;
  ready: boolean;
  onElapsed: () => void;
  onTryAgain: () => void;
  onChangePlan: () => void;
};

export function RateLimited({
  messages,
  locale,
  retryAfterSec,
  ready,
  onElapsed,
  onTryAgain,
  onChangePlan,
}: Props) {
  const [remaining, setRemaining] = useState(retryAfterSec);
  const elapsed = useRef(onElapsed);
  useEffect(() => {
    elapsed.current = onElapsed;
  });

  useEffect(() => {
    // Deadline, not a tick count: background tabs throttle timers.
    const deadline = Date.now() + retryAfterSec * 1000;
    const secondsLeft = () => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (secondsLeft() === 0) {
      elapsed.current();
      return;
    }
    const timer = setInterval(() => {
      const left = secondsLeft();
      setRemaining(left);
      if (left > 0) return;
      clearInterval(timer);
      elapsed.current();
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAfterSec]);

  const countdown = pluralForm(locale, remaining, {
    zero: messages['eid.rateLimited.seconds.zero'],
    one: messages['eid.rateLimited.seconds.one'],
    few: messages['eid.rateLimited.seconds.few'],
    other: messages['eid.rateLimited.seconds.other'],
  }).replace('{count}', String(remaining));

  return (
    <StepScreen
      title={messages['eid.rateLimited.title']}
      actions={[
        { label: messages['eid.action.tryAgain'], onClick: onTryAgain, disabled: !ready },
        { label: messages['eid.action.changePlan'], onClick: onChangePlan },
      ]}
    >
      {/* Per-second number stays outside the live region (08). */}
      {!ready && <p>{countdown}</p>}
      <LiveRegion
        text={ready ? messages['eid.rateLimited.ready'] : messages['eid.rateLimited.waiting']}
      />
    </StepScreen>
  );
}
