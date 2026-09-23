import { beforeEach, describe, expect, it } from 'vitest';

import {
  DATE_MID,
  makeTask,
  mixedList,
  orderingScenarios,
  resetTaskIdCounter,
} from '../support/fixtures';

/**
 * T-003, tier 2 of three: confirms the fixture module is importable and usable
 * from the jsdom environment.
 *
 * Also asserts the tier itself is configured correctly — a jsdom project that
 * silently ran in node would make every DOM test from T-402 onward meaningless.
 */

describe('dom tier configuration', () => {
  it('runs in a jsdom environment with a real document', () => {
    expect(typeof document).not.toBe('undefined');
    expect(typeof window).not.toBe('undefined');
    expect(document.createElement('li')).toBeInstanceOf(window.HTMLElement);
  });

  it('provides the localStorage API that T-202 will fake', () => {
    // Not used here. Asserted because the tier-2 storage failure-injection
    // tests (T-202, T-501) depend on it existing to be replaced.
    expect(typeof window.localStorage).toBe('object');
  });
});

describe('fixtures in the dom tier', () => {
  beforeEach(() => {
    resetTaskIdCounter();
    document.body.innerHTML = '';
  });

  it('is importable and produces tasks', () => {
    const task = makeTask({ title: 'Buy milk', dueDate: DATE_MID });

    expect(task.title).toBe('Buy milk');
    expect(task.dueDate).toBe(DATE_MID);
  });

  it('can drive DOM construction', () => {
    const list = document.createElement('ul');
    for (const task of mixedList) {
      const item = document.createElement('li');
      item.textContent = task.title;
      item.dataset['taskId'] = task.id;
      list.append(item);
    }
    document.body.append(list);

    expect(document.querySelectorAll('li')).toHaveLength(mixedList.length);
    expect(document.querySelector('li')?.textContent).toBe(mixedList[0]?.title);
  });

  it('exposes ordering scenarios usable for render-order assertions', () => {
    expect(orderingScenarios.length).toBeGreaterThan(0);
    for (const scenario of orderingScenarios) {
      expect(scenario.expectedIdOrder.length).toBe(scenario.tasks.length);
    }
  });
});
