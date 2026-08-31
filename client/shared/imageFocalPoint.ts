/** Focal-point helpers for hero/backdrop crops (face-aware when supported). */

export type FocalPoint = { x: number; y: number };

/** Upper-third bias when FaceDetector is unavailable (typical cinematic backdrops). */
const DEFAULT_FOCAL: FocalPoint = { x: 50, y: 22 };
const focalCache = new Map<string, FocalPoint>();
const inflight = new Map<string, Promise<FocalPoint>>();

type FaceDetectorLike = {
    detect: (image: ImageBitmapSource) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
};

const getFaceDetector = (): FaceDetectorLike | null => {
    if (typeof window === 'undefined') return null;
    const Ctor = (window as any).FaceDetector;
    if (typeof Ctor !== 'function') return null;
    try {
        // Accurate mode keeps short heroes from chopping foreheads.
        return new Ctor({ fastMode: false, maxDetectedFaces: 8 });
    } catch {
        try {
            return new Ctor({ fastMode: true, maxDetectedFaces: 5 });
        } catch {
            return null;
        }
    }
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = url;
});

/**
 * Prefer eye-line of the largest / highest faces so short banners keep heads in frame.
 * Ignores tiny or outlier detections that pull the crop toward covered/extra faces.
 */
export const focalFromFaces = (
    faces: Array<{ boundingBox: DOMRectReadOnly }>,
    width: number,
    height: number,
): FocalPoint | null => {
    if (!faces.length || !width || !height) return null;

    const minArea = width * height * 0.004;
    const scored = faces
        .map((face) => {
            const box = face.boundingBox;
            const w = Math.max(1, box.width);
            const h = Math.max(1, box.height);
            const area = w * h;
            const midY = (box.y + h / 2) / height;
            // Prefer larger faces and ones higher in the frame (main subjects).
            const heightBoost = 1 + Math.max(0, 0.6 - midY) * 1.4;
            return { box, w, h, area, score: area * heightBoost };
        })
        .filter((entry) => entry.area >= minArea)
        .sort((a, b) => b.score - a.score);

    const pool = scored.length ? scored : faces.map((face) => {
        const box = face.boundingBox;
        const w = Math.max(1, box.width);
        const h = Math.max(1, box.height);
        return { box, w, h, area: w * h, score: w * h };
    }).sort((a, b) => b.score - a.score);

    // One strong face is enough; at most two so a covered second face can't drag the crop.
    const primary = pool.slice(0, Math.min(2, pool.length));
    let totalWeight = 0;
    let sumX = 0;
    let sumY = 0;
    let topMost = height;

    for (const { box, w, h, area } of primary) {
        // Eye-line sits ~35–40% down a face box, not at geometric center (chin-biased).
        const eyeX = box.x + w / 2;
        const eyeY = box.y + h * 0.36;
        sumX += eyeX * area;
        sumY += eyeY * area;
        topMost = Math.min(topMost, box.y);
        totalWeight += area;
    }
    if (!totalWeight) return null;

    const centerX = (sumX / totalWeight / width) * 100;
    const eyeY = (sumY / totalWeight / height) * 100;
    const topY = (topMost / height) * 100;

    // Pull above the eyes so hair/forehead survive cover crops on short heroes.
    const y = clamp(Math.min(eyeY - 12, topY + 6), 6, 32);
    return {
        x: clamp(centerX, 18, 82),
        y,
    };
};

export const formatBackgroundPosition = (focal: FocalPoint = DEFAULT_FOCAL) => (
    `${focal.x}% ${focal.y}%`
);

/**
 * Resolve a background-position focal point for an image URL.
 * Uses FaceDetector when available; otherwise biases toward the upper third
 * (typical for cinematic backdrops).
 */
export const resolveImageFocalPoint = async (url: string): Promise<FocalPoint> => {
    const key = String(url || '').trim();
    if (!key) return DEFAULT_FOCAL;

    const cached = focalCache.get(key);
    if (cached) return cached;

    const pending = inflight.get(key);
    if (pending) return pending;

    const task = (async () => {
        let focal = DEFAULT_FOCAL;
        try {
            const detector = getFaceDetector();
            if (detector) {
                const img = await loadImage(key);
                const faces = await detector.detect(img);
                const detected = focalFromFaces(faces, img.naturalWidth || img.width, img.naturalHeight || img.height);
                if (detected) focal = detected;
            }
        } catch {
            // CORS / unsupported / detection failure → keep default upper bias
        }
        focalCache.set(key, focal);
        inflight.delete(key);
        return focal;
    })();

    inflight.set(key, task);
    return task;
};

export const prefetchImageFocalPoints = (urls: string[]) => {
    urls.forEach((url) => {
        if (url && !focalCache.has(url) && !inflight.has(url)) {
            void resolveImageFocalPoint(url);
        }
    });
};
