import { describe, expect, it } from 'vitest';
import { nextDownloadProgress } from './updater';

describe('updater progress', () => {
  it('calculates bounded progress when the total is known', () => {
    const started = nextDownloadProgress(0, undefined, {
      event: 'Started',
      data: { contentLength: 100 },
    });
    const halfway = nextDownloadProgress(started.downloadedBytes, started.totalBytes, {
      event: 'Progress',
      data: { chunkLength: 50 },
    });
    expect(halfway.percent).toBe(50);
    const over = nextDownloadProgress(halfway.downloadedBytes, halfway.totalBytes, {
      event: 'Progress',
      data: { chunkLength: 80 },
    });
    expect(over.percent).toBe(100);
  });

  it('keeps progress indeterminate when content length is absent', () => {
    const progress = nextDownloadProgress(10, undefined, {
      event: 'Progress',
      data: { chunkLength: 5 },
    });
    expect(progress.downloadedBytes).toBe(15);
    expect(progress.percent).toBeUndefined();
  });
});
