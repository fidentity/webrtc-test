// timing-probe.js
// Collects inter-frame intervals (IFIs), jitter, and drift between media time and system time.

async function runTimingProbe(video, opts = {}) {
    const { durationMs = 5000, targetFps = 30 } = opts;

    const t0 = performance.now();

    const samples = []; // system timestamp (ms, perf.now)
    const vtimes = []; // media timestamp (s, video.currentTime)
    const dropped = []; // large IFIs or missed callbacks markers

    const useRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
    const endBy = performance.now() + durationMs;

    // Helper to collect one timestamp pair
    function stamp() {
        samples.push(performance.now());
        vtimes.push(video.currentTime || 0);
    }

    // --- Sampling strategies ---

    // rVFC gives us frame-accurate callbacks (Chrome/Edge/Safari, FF behind flag)
    async function sampleWithRVFC() {
        return new Promise((resolve) => {
            let handle;
            const step = (_now, _metadata) => {
                stamp();
                if (performance.now() < endBy && !video.ended) {
                    handle = video.requestVideoFrameCallback(step);
                } else {
                    resolve();
                }
            };
            handle = video.requestVideoFrameCallback(step);
        });
    }

    // rAF fallback is a bit noisier, but OK for timing stats
    async function sampleWithRAF() {
        return new Promise((resolve) => {
            let last = 0;
            const step = (now) => {
                // Throttle roughly to targetFps so we don't oversample rAF (which runs ~60Hz)
                if (!last || now - last >= (1000 / targetFps) * 0.8) {
                    stamp();
                    last = now;
                }
                if (performance.now() < endBy && !video.ended && document.visibilityState === 'visible') {
                    requestAnimationFrame(step);
                } else {
                    resolve();
                }
            };
            requestAnimationFrame(step);
        });
    }

    // Run sampler
    if (useRVFC) {
        await sampleWithRVFC();
    } else {
        await sampleWithRAF();
    }

    // --- Compute metrics ---
    // Inter-frame intervals from system clock
    const ifis = diffs(samples); // ms
    const medIfi = median(ifis);
    const meanIfi = mean(ifis);
    const stdIfi = stddev(ifis);
    const cvIfi = safeDiv(stdIfi, meanIfi); // coefficient of variation
    const p90Ifi = percentile(ifis, 0.9);
    const p99Ifi = percentile(ifis, 0.99);
    const fpsEst = meanIfi > 0 ? 1000 / meanIfi : 0;

    // Media clock drift vs system clock
    // Map media time deltas (s) to ms and compare to system deltas
    const vdt = diffs(vtimes).map((s) => s * 1000); // ms
    const sdt = ifis.slice(); // ms
    const driftPerFrame = arraySub(sdt, vdt); // ms/frame (positive means system advanced more than media)
    const driftStats = summarize(driftPerFrame);

    // Autocorrelation & spectrum on IFIs (periodicity/looping detection)
    const ifiCentered = centerZ(ifis);
    const acf = autocorr(ifiCentered, Math.min(60, Math.floor(ifis.length / 2)));
    const acfMaxLag = argmax(acf.slice(1)) + 1; // best non-zero lag
    const acfMax = acf[acfMaxLag] ?? 0;

    const spectrum = magnitudeFFT(ifiCentered);
    const { peakFreqHz, peakStrength } = dominantFrequency(spectrum, fpsEst ? fpsEst : 30);

    // Outlier/drop detection
    const bigGapMs = (1000 / Math.max(10, targetFps)) * 3; // 3× expected interval
    const dropCount = ifis.filter((x) => x > bigGapMs).length;
    const dropRate = safeDiv(dropCount, ifis.length);

    // Final metrics object
    return {
        sampler: useRVFC ? 'rVFC' : 'rAF',
        nFrames: samples.length,
        durationMs: samples.length ? samples[samples.length - 1] - samples[0] : 0,
        fpsEst,
        ifi: {
            meanMs: round(meanIfi),
            medianMs: round(medIfi),
            stdMs: round(stdIfi),
            cv: round(cvIfi, 6),
            p90Ms: round(p90Ifi),
            p99Ms: round(p99Ifi),
            dropRate: round(dropRate, 6),
            acf: { bestLag: acfMaxLag, bestCorr: round(acfMax, 6) },
            spectrum: { peakFreqHz: round(peakFreqHz, 4), peakStrength: round(peakStrength, 6) },
        },
        drift: {
            // positive mean => system clock progressed faster than media clock on average
            meanMsPerFrame: round(driftStats.mean),
            medianMsPerFrame: round(driftStats.median),
            stdMsPerFrame: round(driftStats.std),
            p90MsPerFrame: round(driftStats.p90),
        },
        raw: {
            // keep short! these arrays can be large; send only if you need to debug
            samples: samples.slice(0, 5), // just a peek to prove structure
            ifiCount: ifis.length,
        },
    };
}

// ---------- Small math helpers ----------
function diffs(arr) {
    const out = [];
    for (let i = 1; i < arr.length; i++) out.push(arr[i] - arr[i - 1]);
    return out;
}
function mean(arr) {
    return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}
function median(arr) {
    if (!arr.length) return 0;
    const tmp = [...arr].sort((a, b) => a - b);
    const m = Math.floor(tmp.length / 2);
    return tmp.length % 2 ? tmp[m] : (tmp[m - 1] + tmp[m]) / 2;
}
function variance(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    let s = 0;
    for (const x of arr) s += (x - m) * (x - m);
    return s / (arr.length - 1);
}
function stddev(arr) {
    return Math.sqrt(Math.max(0, variance(arr)));
}
function percentile(arr, p) {
    if (!arr.length) return 0;
    const tmp = [...arr].sort((a, b) => a - b);
    const idx = Math.min(tmp.length - 1, Math.max(0, Math.floor(p * (tmp.length - 1))));
    return tmp[idx];
}
function arraySub(a, b) {
    const n = Math.min(a.length, b.length);
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = a[i] - b[i];
    return out;
}
function summarize(arr) {
    return {
        mean: mean(arr),
        median: median(arr),
        std: stddev(arr),
        p90: percentile(arr, 0.9),
    };
}
function centerZ(arr) {
    const m = mean(arr);
    return arr.map((x) => x - m);
}
function autocorr(arr, maxLag) {
    // normalized autocorrelation (lag 0 = 1)
    const n = arr.length;
    const varX = variance(arr) || 1e-12;
    const out = new Array(maxLag + 1).fill(0);
    for (let lag = 0; lag <= maxLag; lag++) {
        let s = 0;
        for (let i = lag; i < n; i++) s += arr[i] * arr[i - lag];
        out[lag] = s / ((n - lag) * varX);
    }
    return out;
}
function magnitudeFFT(arr) {
    // Minimal radix-2 FFT magnitude using real input; if not power of two, pad
    const n = 1 << Math.ceil(Math.log2(Math.max(2, arr.length)));
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    re.set(arr);
    fft(re, im); // in-place
    const mag = new Float64Array(n / 2);
    for (let k = 1; k < n / 2; k++) {
        mag[k] = Math.hypot(re[k], im[k]);
    }
    return mag;
}
function dominantFrequency(mag, nominalFps) {
    // mag[k] corresponds to k * (sampleRate / N). Our "sampleRate" ~= nominal FPS of callback stream.
    const N = mag.length * 2;
    const sampleRate = nominalFps || 30; // rough; good enough to spot narrow peaks
    let bestK = 0,
        best = 0;
    for (let k = 1; k < mag.length; k++) {
        if (mag[k] > best) {
            best = mag[k];
            bestK = k;
        }
    }
    const freq = (bestK * sampleRate) / N;
    const norm = best / (mag.reduce((s, x) => s + x, 0) + 1e-9); // normalized peak strength
    return { peakFreqHz: freq, peakStrength: norm };
}
// Cooley–Tukey iterative FFT (real/imag arrays)
function fft(re, im) {
    const n = re.length;
    // bit-reversal
    for (let i = 0, j = 0; i < n; i++) {
        if (i < j) {
            const tr = re[i];
            re[i] = re[j];
            re[j] = tr;
            const ti = im[i];
            im[i] = im[j];
            im[j] = ti;
        }
        let m = n >> 1;
        while (m >= 1 && j >= m) {
            j -= m;
            m >>= 1;
        }
        j += m;
    }
    // butterflies
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        const wlenRe = Math.cos(ang),
            wlenIm = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let wRe = 1,
                wIm = 0;
            for (let j = 0; j < len / 2; j++) {
                const uRe = re[i + j],
                    uIm = im[i + j];
                const vRe = re[i + j + len / 2] * wRe - im[i + j + len / 2] * wIm;
                const vIm = re[i + j + len / 2] * wIm + im[i + j + len / 2] * wRe;
                re[i + j] = uRe + vRe;
                im[i + j] = uIm + vIm;
                re[i + j + len / 2] = uRe - vRe;
                im[i + j + len / 2] = uIm - vIm;
                const tRe = wRe * wlenRe - wIm * wlenIm;
                const tIm = wRe * wlenIm + wIm * wlenRe;
                wRe = tRe;
                wIm = tIm;
            }
        }
    }
}
function round(x, d = 3) {
    return Number.isFinite(x) ? Number(x.toFixed(d)) : 0;
}
function safeDiv(a, b) {
    return b ? a / b : 0;
}
function argmax(arr) {
    let maxIndex = 0;
    for (let i = 1; i < arr.length; i++) {
        if (arr[i] > arr[maxIndex]) maxIndex = i;
    }
    return maxIndex;
}
