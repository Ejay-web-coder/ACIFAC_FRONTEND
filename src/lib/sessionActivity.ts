// Whether someone is actually using the page. The server signs a session out
// after 20 minutes without activity, and it should measure the person, not
// background traffic: requests made while nobody has touched the page (live
// update refreshes, timers) are sent as "passive" and do not keep the session
// alive. Nothing here is a security decision; the server enforces the timeout.

export const SESSION_ACTIVITY_HEADER = 'X-Session-Activity';

// A request counts as the person's own if they interacted this recently.
const ACTIVE_WINDOW_MS = 60 * 1000;

// Loading or refreshing the page is itself activity.
let lastInteractionAt = Date.now();
let lastServerActivityAt = Date.now();

const markInteraction = () => {
  lastInteractionAt = Date.now();
};

if (typeof window !== 'undefined') {
  // Capture phase, so scrolling inside panels and modals counts too.
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'mousemove']) {
    window.addEventListener(type, markInteraction, { capture: true, passive: true });
  }
}

export const isUserActive = () => Date.now() - lastInteractionAt < ACTIVE_WINDOW_MS;
export const lastInteraction = () => lastInteractionAt;
// When the server last saw a request that counted as activity.
export const lastServerActivity = () => lastServerActivityAt;
export const noteServerActivity = () => {
  lastServerActivityAt = Date.now();
};
