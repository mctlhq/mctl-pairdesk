import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateSlider } from './components.js';
import type { Asset } from './types.js';

vi.mock('./api.js', () => ({ api: { get: vi.fn() } }));
vi.mock('./tg.js', () => ({ scrollFieldIntoView: vi.fn(), initData: vi.fn(() => '') }));

async function getMockGet() {
  const { api } = await import('./api.js');
  return vi.mocked(api.get);
}

interface Props {
  base: Asset;
  quote: Asset;
  wantAmount: string;
  onWantAmountChange: ReturnType<typeof vi.fn>;
  onRateResolved: ReturnType<typeof vi.fn>;
}

function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    base: 'EUR',
    quote: 'RUB',
    wantAmount: '10',
    onWantAmountChange: vi.fn(),
    onRateResolved: vi.fn(),
    ...overrides,
  };
}

function renderSlider(props: Props) {
  return render(
    <RateSlider
      base={props.base}
      quote={props.quote}
      wantAmount={props.wantAmount}
      onWantAmountChange={props.onWantAmountChange as (v: string) => void}
      onRateResolved={props.onRateResolved as (rate: string | null) => void}
    />,
  );
}

// Inputs use inputMode="decimal" not type="number", so they have role=textbox.
// Index 0 = want input, index 1 = give input.
function getGiveInput(): HTMLInputElement {
  return screen.getAllByRole('textbox')[1] as HTMLInputElement;
}

describe('RateSlider', () => {
  let mockGet: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockGet = await getMockGet();
    mockGet.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // T1: Want anchors — slider moves, give updates, want unchanged.
  it('T1: want anchors — slider moves give, want unchanged', async () => {
    mockGet.mockResolvedValue({ rate: 100 });
    const props = makeProps();
    renderSlider(props);

    // Wait for async rate fetch and effects to settle.
    await act(async () => {});
    await act(async () => {});

    expect(getGiveInput().value).toBe('1000.00');

    // Move slider to 110 (refRate=100, max=110).
    const slider = screen.getByRole('slider');
    await act(async () => {
      fireEvent.change(slider, { target: { value: '110' } });
    });

    // give = wantAmount * newRate = 10 * 110 = 1100.00
    expect(getGiveInput().value).toBe('1100.00');
    // want callback never called
    expect(props.onWantAmountChange).not.toHaveBeenCalled();
  });

  // T2: Give anchors — typing give updates want.
  it('T2: give anchors — typing give calls onWantAmountChange', async () => {
    mockGet.mockResolvedValue({ rate: 100 });
    const props = makeProps();
    renderSlider(props);

    await act(async () => {});
    await act(async () => {});

    const giveInput = getGiveInput();

    // Focus give input then type a value.
    await act(async () => {
      await userEvent.click(giveInput);
      await userEvent.clear(giveInput);
      await userEvent.type(giveInput, '1200');
    });

    // onWantAmountChange should have been called with give / resolvedRate = 1200/100 = 12.00
    expect(props.onWantAmountChange).toHaveBeenCalledWith('12.00');
  });

  // T3: Give anchors — slider does not override give while give is anchored.
  it('T3: slider does not override give while give is anchored', async () => {
    mockGet.mockResolvedValue({ rate: 100 });
    const props = makeProps();
    renderSlider(props);

    await act(async () => {});
    await act(async () => {});

    // Type into give input so lastEditedField becomes 'give'.
    await act(async () => {
      await userEvent.click(getGiveInput());
      await userEvent.clear(getGiveInput());
      await userEvent.type(getGiveInput(), '500');
    });

    const giveAfterType = getGiveInput().value;

    // Move slider — with lastEditedField==='give', the effect should NOT
    // overwrite giveInputValue; it calls onWantAmountChange instead.
    const slider = screen.getByRole('slider');
    await act(async () => {
      fireEvent.change(slider, { target: { value: '110' } });
    });

    // give input stays at what user typed (not recalculated from want).
    expect(getGiveInput().value).toBe(giveAfterType);
  });

  // T4: Non-anchored side updates on refRate arrival.
  it('T4: onRateResolved called with rate string and give computed on load', async () => {
    mockGet.mockResolvedValue({ rate: 200 });
    const props = makeProps({ wantAmount: '5' });
    renderSlider(props);

    await act(async () => {});
    await act(async () => {});

    // onRateResolved should have been called with the resolved rate formatted to 8 dp.
    expect(props.onRateResolved).toHaveBeenCalledWith('200.00000000');
    // give = wantAmount * rate = 5 * 200 = 1000.00
    expect(getGiveInput().value).toBe('1000.00');
  });

  // T5: wantAmount prop change recalculates give.
  it('T5: wantAmount prop change recalculates give without calling onWantAmountChange', async () => {
    mockGet.mockResolvedValue({ rate: 100 });
    const props = makeProps();
    const { rerender } = renderSlider(props);

    await act(async () => {});
    await act(async () => {});

    expect(getGiveInput().value).toBe('1000.00');

    props.onWantAmountChange.mockReset();

    await act(async () => {
      rerender(
        <RateSlider
          base={props.base}
          quote={props.quote}
          wantAmount="20"
          onWantAmountChange={props.onWantAmountChange as (v: string) => void}
          onRateResolved={props.onRateResolved as (rate: string | null) => void}
        />,
      );
    });

    expect(getGiveInput().value).toBe('2000.00');
    expect(props.onWantAmountChange).not.toHaveBeenCalled();
  });

  // T6: Pair change resets state and re-fetches rate.
  it('T6: pair change calls onRateResolved(null) then re-fetches rate', async () => {
    mockGet.mockResolvedValue({ rate: 100 });
    const props = makeProps();
    const { rerender } = renderSlider(props);

    await act(async () => {});
    await act(async () => {});

    props.onRateResolved.mockReset();
    mockGet.mockResolvedValue({ rate: 50 });

    // Change the quote pair.
    await act(async () => {
      rerender(
        <RateSlider
          base={props.base}
          quote="USDT"
          wantAmount={props.wantAmount}
          onWantAmountChange={props.onWantAmountChange as (v: string) => void}
          onRateResolved={props.onRateResolved as (rate: string | null) => void}
        />,
      );
    });
    await act(async () => {});
    await act(async () => {});

    // First call should be null (reset on pair change).
    expect(props.onRateResolved).toHaveBeenCalledWith(null);
    // Then new rate should have been resolved.
    expect(props.onRateResolved).toHaveBeenCalledWith('50.00000000');

    // give should update to wantAmount * newRate = 10 * 50 = 500.00
    expect(getGiveInput().value).toBe('500.00');
  });

  // T7: Edge: non-finite give input — want not updated.
  it('T7: non-finite give input does not call onWantAmountChange', async () => {
    mockGet.mockResolvedValue({ rate: 100 });
    const props = makeProps();
    renderSlider(props);

    await act(async () => {});
    await act(async () => {});

    const giveInput = getGiveInput();
    props.onWantAmountChange.mockReset();

    await act(async () => {
      await userEvent.click(giveInput);
      await userEvent.clear(giveInput);
      await userEvent.type(giveInput, 'abc');
    });

    expect(props.onWantAmountChange).not.toHaveBeenCalled();
  });

  // T8: Edge: division-by-zero guard.
  it('T8: rate=0 guard prevents division by zero when typing in give', async () => {
    mockGet.mockResolvedValue({ rate: 0 });
    const props = makeProps();
    renderSlider(props);

    await act(async () => {});
    await act(async () => {});

    // With resolvedRate=0 the component still renders. Typing in give should not
    // trigger onWantAmountChange because the resolvedRate > 0 guard is false.
    const textboxes = screen.getAllByRole('textbox');
    if (textboxes.length > 1) {
      const giveInput = textboxes[1] as HTMLInputElement;
      props.onWantAmountChange.mockReset();

      await act(async () => {
        await userEvent.click(giveInput);
        await userEvent.clear(giveInput);
        await userEvent.type(giveInput, '100');
      });

      expect(props.onWantAmountChange).not.toHaveBeenCalled();
    } else {
      // Component shows loading/fallback — still no call.
      expect(props.onWantAmountChange).not.toHaveBeenCalled();
    }
  });

  // T9: Edge: blur auto-fill.
  it('T9: blur auto-fills empty give with wantAmount * resolvedRate', async () => {
    mockGet.mockResolvedValue({ rate: 100 });
    const props = makeProps();
    renderSlider(props);

    await act(async () => {});
    await act(async () => {});

    const giveInput = getGiveInput();

    // Focus, clear the give input, then blur.
    await act(async () => {
      await userEvent.click(giveInput);
      await userEvent.clear(giveInput);
    });

    expect(giveInput.value).toBe('');

    await act(async () => {
      fireEvent.blur(giveInput);
    });

    // After blur, give should be auto-filled: wantAmount * resolvedRate = 10 * 100 = 1000.00
    expect(giveInput.value).toBe('1000.00');
  });

  // T10: Edge: API failure shows unavailable fallback UI.
  it('T10: API failure shows unavailable fallback and calls onRateResolved(null)', async () => {
    mockGet.mockRejectedValue(new Error('network error'));
    const props = makeProps();
    renderSlider(props);

    await act(async () => {});
    await act(async () => {});

    // onRateResolved(null) was called at init; no subsequent call with a numeric rate.
    expect(props.onRateResolved).toHaveBeenCalledWith(null);
    expect(props.onRateResolved).not.toHaveBeenCalledWith(expect.stringMatching(/\d/));

    // The fallback UI should contain the unavailable hint text.
    expect(screen.getByText(/reference rate unavailable/i)).toBeInTheDocument();
  });
});
