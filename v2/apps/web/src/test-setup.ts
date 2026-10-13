import "@testing-library/jest-dom/vitest";

// jsdom has no layout; the router calls scrollTo on navigation.
window.scrollTo = () => {};
