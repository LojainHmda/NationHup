interface PageState {
  scrollY: number;
  scrollX: number;
  filters?: Record<string, any>;
  additionalState?: Record<string, any>;
  timestamp: number;
}

const PAGE_STATE_KEY = 'page_state_stack';
const SCROLL_CONTAINER_ID = 'main-scroll-container';

function getScrollContainer(): HTMLElement | null {
  return document.getElementById(SCROLL_CONTAINER_ID);
}

function getPageStateStack(): Map<string, PageState> {
  try {
    const stored = sessionStorage.getItem(PAGE_STATE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return new Map(Object.entries(parsed));
    }
  } catch (e) {
    console.warn('Failed to parse page state stack:', e);
  }
  return new Map();
}

function savePageStateStack(stack: Map<string, PageState>): void {
  try {
    const obj = Object.fromEntries(stack);
    sessionStorage.setItem(PAGE_STATE_KEY, JSON.stringify(obj));
  } catch (e) {
    console.warn('Failed to save page state stack:', e);
  }
}

export function getStoredScrollPosition(pageKey: string): { scrollX: number; scrollY: number } | null {
  const stack = getPageStateStack();
  const state = stack.get(pageKey);
  if (state) {
    return { scrollX: state.scrollX, scrollY: state.scrollY };
  }
  return null;
}

export function getPageState(pageKey: string): PageState | null {
  const stack = getPageStateStack();
  return stack.get(pageKey) || null;
}

export function savePageStateBeforeNavigation(
  fromPage: string, 
  additionalState?: Record<string, any>
): void {
  const stack = getPageStateStack();
  const container = getScrollContainer();
  
  const state: PageState = {
    scrollY: container ? container.scrollTop : window.scrollY,
    scrollX: container ? container.scrollLeft : window.scrollX,
    additionalState,
    timestamp: Date.now(),
  };
  
  stack.set(fromPage, state);
  savePageStateStack(stack);
}

export function restoreScrollPosition(scrollX: number, scrollY: number): void {
  const container = getScrollContainer();
  if (container) {
    container.scrollTop = scrollY;
    container.scrollLeft = scrollX;
  } else {
    window.scrollTo(scrollX, scrollY);
  }
}

export function clearPageState(pageKey: string): void {
  const stack = getPageStateStack();
  stack.delete(pageKey);
  savePageStateStack(stack);
}
