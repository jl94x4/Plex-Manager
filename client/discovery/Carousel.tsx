import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useDiscoverI18n } from './i18n';

interface CarouselProps {
    children: React.ReactNode;
}

export const Carousel: React.FC<CarouselProps> = ({ children }) => {
    const { t } = useDiscoverI18n();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [atStart, setAtStart] = useState(true);
    const [atEnd, setAtEnd] = useState(true);

    const handleScroll = useCallback(() => {
        if (!scrollContainerRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
        const margin = 5;
        const canScroll = scrollWidth > clientWidth + margin;
        if (!canScroll) {
            setAtStart(true);
            setAtEnd(true);
            return;
        }
        setAtStart(scrollLeft <= margin);
        setAtEnd(scrollLeft >= scrollWidth - clientWidth - margin);
    }, []);

    useEffect(() => {
        handleScroll();
        const node = scrollContainerRef.current;
        if (!node) return undefined;

        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => handleScroll())
            : null;
        resizeObserver?.observe(node);
        window.addEventListener('resize', handleScroll);

        const t = window.setTimeout(handleScroll, 100);

        return () => {
            resizeObserver?.disconnect();
            window.removeEventListener('resize', handleScroll);
            window.clearTimeout(t);
        };
    }, [children, handleScroll]);

    const scroll = (direction: 'left' | 'right') => {
        if (!scrollContainerRef.current) return;
        const { clientWidth } = scrollContainerRef.current;
        const scrollAmount = direction === 'left' ? -clientWidth + 100 : clientWidth - 100;

        scrollContainerRef.current.scrollBy({
            left: scrollAmount,
            behavior: 'smooth',
        });
    };

    return (
        <div className="relative w-full min-w-0">
            {/* Seerr-style: chevrons sit on the section title row, top-right — no side gradients */}
            <div className="absolute right-1 -top-9 z-10 flex items-center text-muted">
                <button
                    type="button"
                    onClick={() => scroll('left')}
                    disabled={atStart}
                    className={`p-0.5 transition-colors ${atStart ? 'text-muted/30 cursor-default' : 'hover:text-text'}`}
                    aria-label={t('common.scrollLeft')}
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                    type="button"
                    onClick={() => scroll('right')}
                    disabled={atEnd}
                    className={`p-0.5 transition-colors ${atEnd ? 'text-muted/30 cursor-default' : 'hover:text-text'}`}
                    aria-label={t('common.scrollRight')}
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            </div>

            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide py-2 px-2 w-full"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {children}
            </div>
        </div>
    );
};
