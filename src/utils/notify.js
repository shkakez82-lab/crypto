// utils/notify.js
const subscribers = {};

export function notify(event, payload) {
  if (subscribers[event]) {
    subscribers[event].forEach(fn => fn(payload));
  }
}

export function subscribe(event, fn) {
  if (!subscribers[event]) subscribers[event] = [];
  subscribers[event].push(fn);
}
