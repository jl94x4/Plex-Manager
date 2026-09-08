import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useDiscoverI18n } from './i18n';

interface CarouselProps {
    children: React.ReactNode;
}

const SCROLL_EDGE_PX = 8;

export const Carousel: React.FC<CarouselProps> = ({ children }) => {
    const { t } = useDiscoverI18n();
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [atStart, setAtStart] = useState(true);
    const [atEnd, setAtEnd] = useState(true);
    const [canScroll, setCanScroll] = useState(false);

    const handleScroll = useCallback(() => {
        const node = scrollContainerRef.current;
        if (!node) return;
        const { scrollLeft, scrollWidth, clientWidth } = node;
        const overflow = scrollWidth > clientWidth + SCROLL_EDGE_PX;
        setCanScroll(overflow);
        if (!overflow) {
            setAtStart(true);
            setAtEnd(true);
            return;
        }
        const maxScroll = Math.max(0, scrollWidth - clientWidth);
        setAtStart(scrollLeft <= SCROLL_EDGE_PX);
        setAtEnd(scrollLeft >= maxScroll - SCROLL_EDGE_PX);
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

        const mutationObserver = typeof MutationObserver !== 'undefined'
            ? new MutationObserver(() => handleScroll())
            : null;
        mutationObserver?.observe(node, { childList: true, subtree: true });

        const t1 = window.setTimeout(handleScroll, 100);
        const t2 = window.setTimeout(handleScroll, 400);

        return () => {
            resizeObserver?.disconnect();
            mutationObserver?.disconnect();
            window.removeEventListener('resize', handleScroll);
            window.clearTimeout(t1);
            window.clearTimeout(t2);
        };
    }, [children, handleScroll]);

    const scroll = (direction: 'left' | 'right') => {
        const node = scrollContainerRef.current;
        if (!node || !canScroll) return;
        const { clientWidth, scrollWidth } = node;
        const maxScroll = Math.max(0, scrollWidth - clientWidth);
        const page = Math.max(clientWidth - 100, 160);

        if (direction === 'right') {
            if (atEnd) {
                node.scrollTo({ left: 0, behavior: 'smooth' });
                return;
            }
            node.scrollBy({ left: page, behavior: 'smooth' });
            return;
        }
        if (atStart) {
            node.scrollTo({ left: maxScroll, behavior: 'smooth' });
            return;
        }
        node.scrollBy({ left: -page, behavior: 'smooth' });
    };

    return (
        <div className="relative w-full min-w-0">
            <div className="absolute right-1 -top-9 z-10 flex items-center text-muted">
                <button
                    type="button"
                    onClick={() => scroll('left')}
                    disabled={!canScroll}
                    className={`p-0.5 transition-colors ${!canScroll ? 'text-muted/30 cursor-default' : 'hover:text-text'}`}
                    aria-label={t('common.scrollLeft')}
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                    type="button"
                    onClick={() => scroll('right')}
                    disabled={!canScroll}
                    className={`p-0.5 transition-colors ${!canScroll ? 'text-muted/30 cursor-default' : 'hover:text-text'}`}
                    aria-label={t('common.scrollRight')}
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            </div>

            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex gap-4 overflow-x-auto snap-x snap-proximity scrollbar-hide py-2 px-2 w-full"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {children}
            </div>
        </div>
    );
};
