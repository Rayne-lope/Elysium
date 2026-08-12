import { describe, expect, it, vi } from 'vitest';
import { processWithLimit } from '../../src/pages/api/admin/pixabay/import';

describe('Pixabay batch failure isolation', () => {
  it('continues processing when one item throws unexpectedly', async () => {
    const importer = {
      async importOne(id: number) {
        if (id === 2) throw new Error('R2 write failed');
        return { pixabayId: id, status: 'imported' as const, wallpaperId: `wp_${id}` };
      },
    };
    const items = await processWithLimit(
      { images: [{ pixabayId: 1 }, { pixabayId: 2 }, { pixabayId: 3 }] },
      importer as never
    );
    expect(items).toHaveLength(3);
    expect(items.find((item) => item.pixabayId === 2)).toMatchObject({ status: 'failed', reason: 'R2 write failed' });
    expect(items.filter((item) => item.status === 'imported')).toHaveLength(2);
  });

  it('processes each import serially to avoid bursting the upstream API', async () => {
    let active = 0;
    let maximumActive = 0;
    const importer = {
      async importOne(id: number) {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        active -= 1;
        return { pixabayId: id, status: 'imported' as const, wallpaperId: `wp_${id}` };
      },
    };

    await processWithLimit(
      { images: [{ pixabayId: 1 }, { pixabayId: 2 }, { pixabayId: 3 }] },
      importer as never
    );

    expect(maximumActive).toBe(1);
  });

  it('paces real batch imports without delaying the final item', async () => {
    const sleeper = vi.fn(async () => {});
    const importer = {
      async importOne(id: number) {
        return { pixabayId: id, status: 'imported' as const, wallpaperId: `wp_${id}` };
      },
    };

    await processWithLimit(
      { images: [{ pixabayId: 1 }, { pixabayId: 2 }, { pixabayId: 3 }] },
      importer as never,
      undefined,
      { intervalMilliseconds: 1_000, sleeper }
    );

    expect(sleeper).toHaveBeenCalledTimes(2);
    expect(sleeper).toHaveBeenNthCalledWith(1, 1_000);
  });
});
