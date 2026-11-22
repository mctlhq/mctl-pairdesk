import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api.js', () => ({ api: { get: vi.fn() } }));
vi.mock('./tg.js', () => ({ scrollFieldIntoView: vi.fn(), initData: vi.fn(() => '') }));

const maker = { username: 'bob', display_name: 'Bob', rating_score: '4.5', completed_deals_count: 3 };

async function load(enabled: boolean) {
  vi.resetModules();
  vi.doMock('./features.js', () => ({ RATING_ENABLED: enabled }));
  return (await import('./components.js')).Maker;
}

describe('Maker rating visibility', () => {
  beforeEach(() => vi.resetModules());

  it('hides the star and score when RATING_ENABLED is false, keeps deals count', async () => {
    const Maker = await load(false);
    const { container } = render(<Maker maker={maker} />);
    expect(container.querySelector('.pd-star')).toBeNull();
    expect(screen.queryByText('4.5')).toBeNull();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('shows the star and score when RATING_ENABLED is true', async () => {
    const Maker = await load(true);
    const { container } = render(<Maker maker={maker} />);
    expect(container.querySelector('.pd-star')).not.toBeNull();
    expect(screen.getByText('4.5')).toBeTruthy();
  });
});
