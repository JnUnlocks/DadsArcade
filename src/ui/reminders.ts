/**
 * The daily reminder switch, at the foot of the streak screen. It works out
 * what this phone can do first, and only shows a switch when the answer is
 * "reminders can be turned on or off". The rules are in core/reminders.ts.
 */

import {
  REMINDER_HOUR,
  reminderState,
  turnRemindersOff,
  turnRemindersOn,
  type ReminderState,
} from "../core/reminders";

function el(tag: string, className = "", text = ""): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function hourLabel(hour: number): string {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: "numeric" });
}

/**
 * The menu's one-time offer: a nudge tomorrow? Starts empty and only fills
 * in if this phone can actually take reminders, so an offer is never made
 * that can't be kept. `onShown` fires once it's on screen; `onDecline` on
 * NOT NOW.
 */
export function buildReminderOffer(
  onTap: () => void,
  onShown: () => void,
  onDecline: () => void,
): HTMLElement {
  const box = el("div", "reminder-offer");
  void reminderState()
    .catch(() => "unavailable" as const)
    .then((state) => {
      if (state !== "off") return;
      onShown();
      const when = hourLabel(REMINDER_HOUR);
      const text = el(
        "p",
        "reminder-offer-text",
        `Want a nudge tomorrow? One reminder at ${when}, only on days you haven't played yet.`,
      );
      const yes = el("button", "btn btn--primary reminder-offer-yes", "REMIND ME");
      const no = el("button", "btn btn--ghost reminder-offer-no", "NOT NOW");
      const buttons = el("div", "reminder-offer-buttons");
      buttons.append(yes, no);
      box.append(text, buttons);
      let busy = false;
      yes.addEventListener("click", () => {
        if (busy) return;
        busy = true;
        onTap();
        yes.textContent = "…";
        void turnRemindersOn()
          .catch(() => "off" as const)
          .then((next) => {
            text.textContent =
              next === "on"
                ? `Done. See you tomorrow at ${when} -- only if you haven't played by then.`
                : next === "blocked"
                  ? "Notifications are off for the arcade. You can allow them in your phone's settings."
                  : "That didn't work this time. You can try again from the streak screen.";
            buttons.remove();
          });
      });
      no.addEventListener("click", () => {
        onTap();
        onDecline();
        box.remove();
      });
    });
  return box;
}

/** Starts empty and fills in once the phone has been asked what it supports. */
export function buildReminderSection(onTap: () => void): HTMLElement {
  const box = el("div", "reminder");
  let busy = false;

  const render = (state: ReminderState) => {
    box.replaceChildren();
    if (state === "unavailable") return;
    box.append(el("h3", "streak-heading", "REMINDER"));
    const when = hourLabel(REMINDER_HOUR);

    if (state === "needs-home-screen") {
      box.append(
        el(
          "p",
          "reminder-text",
          `Want a nudge at ${when} on days you haven't played? Add the arcade to your home screen first ` +
            "(Share, then Add to Home Screen), open it from there, and turn reminders on here.",
        ),
      );
      return;
    }
    if (state === "blocked") {
      box.append(
        el(
          "p",
          "reminder-text",
          "Notifications are turned off for the arcade. To get reminders, allow them in your phone's settings.",
        ),
      );
      return;
    }

    const on = state === "on";
    box.append(
      el(
        "p",
        "reminder-text",
        on
          ? `On. One nudge at ${when}, only on days you haven't played yet.`
          : `One nudge at ${when}, only on days you haven't played yet. Never more than one a day.`,
      ),
    );
    const button = el("button", on ? "btn btn--ghost" : "btn btn--primary", on ? "TURN OFF" : "REMIND ME");
    button.addEventListener("click", () => {
      if (busy) return;
      busy = true;
      onTap();
      button.textContent = "…";
      void (on ? turnRemindersOff() : turnRemindersOn())
        .catch(() => "off" as const)
        .then((next) => {
          busy = false;
          render(next);
        });
    });
    box.append(button);
  };

  void reminderState()
    .catch(() => "unavailable" as const)
    .then(render);
  return box;
}
