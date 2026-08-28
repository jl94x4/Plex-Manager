import React, { useEffect, useState } from 'react';
import { NoPosterPlaceholder } from './NoPosterPlaceholder';

const MAX_RETRIES = 2;

const withRetryParam = (url: string, attempt: number) => {
    if (!url || attempt <= 0) return url;
    const join = url.includes('?') ? '&' : '?';
    return `${url}${join}retry=${attempt}`;
};

type Props = {
    src: string;
    fallbackSrc?: string;
    alt?: string;
    className?: string;
    loading?: 'lazy' | 'eager';
    compactPlaceholder?: boolean;
};

export const RetryablePoster: React.FC<Props> = ({
    src,
    fallbackSrc = '',
    alt = '',
    className = 'w-full h-full object-cover',
    loading = 'eager',
    compactPlaceholder = true,
}) => {
    const [attempt, setAttempt] = useState(0);
    const [useFallback, setUseFallback] = useState(false);
    const [failed, setFailed] = useState(!src && !fallbackSrc);

    useEffect(() => {
        setAttempt(0);
        setUseFallback(false);
        setFailed(!src && !fallbackSrc);
    }, [src, fallbackSrc]);

    if (failed || (!src && !fallbackSrc)) {
        return <NoPosterPlaceholder compact={compactPlaceholder} />;
    }

    const currentSrc = useFallback && fallbackSrc
        ? withRetryParam(fallbackSrc, attempt)
        : withRetryParam(src, attempt);

    return (
        <img
            key={`${useFallback ? 'fb' : 'src'}-${attempt}`}
            src={currentSrc}
            alt={alt}
            loading={loading}
            decoding="async"
            className={className}
            onError={() => {
                if (!useFallback && fallbackSrc && fallbackSrc !== src) {
                    setUseFallback(true);
                    setAttempt(0);
                    return;
                }
                if (attempt < MAX_RETRIES) {
                    setAttempt((n) => n + 1);
                    return;
                }
                setFailed(true);
            }}
        />
    );
};
