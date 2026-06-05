import type { ReactNode } from "react";

export type IconName =
  | "hash"
  | "plus"
  | "send"
  | "sliders"
  | "close"
  | "sparkles"
  | "image"
  | "lock"
  | "trash"
  | "message"
  | "chevron"
  | "stop"
  | "users"
  | "check"
  | "crown"
  | "memory"
  | "search"
  | "clock"
  | "chart"
  | "book"
  | "dot";

const inner = (name: IconName): ReactNode => {
  switch (name) {
    case "hash":
      return <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />;
    case "plus":
      return <path d="M12 5v14M5 12h14" />;
    case "send":
      return <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />;
    case "sliders":
      return <path d="M4 21v-7M4 10V3M12 21v-9M12 6V3M20 21v-5M20 12V3M1 14h6M9 6h6M17 16h6" />;
    case "close":
      return <path d="M18 6 6 18M6 6l12 12" />;
    case "sparkles":
      return <path d="M12 3l1.8 4.6L18.5 9.5l-4.7 1.9L12 16l-1.8-4.6L5.5 9.5l4.7-1.9zM19 14l.8 2 .2 .1 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z" />;
    case "image":
      return (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </>
      );
    case "lock":
      return (
        <>
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </>
      );
    case "trash":
      return <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />;
    case "message":
      return <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />;
    case "chevron":
      return <path d="M9 6l6 6-6 6" />;
    case "stop":
      return <rect x="6" y="6" width="12" height="12" rx="2" />;
    case "users":
      return (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
        </>
      );
    case "check":
      return <path d="M20 6 9 17l-5-5" />;
    case "crown":
      return (
        <>
          <path d="M4 18h16" />
          <path d="M4 18 2.5 8l5.5 4 4-7 4 7 5.5-4L20 18z" />
        </>
      );
    case "memory":
      return (
        <>
          <path d="M12 3l9 5-9 5-9-5z" />
          <path d="M3 13l9 5 9-5" />
        </>
      );
    case "search":
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </>
      );
    case "clock":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      );
    case "chart":
      return <path d="M3 21h18M6 21V11M11 21V6M16 21v-8M21 21V9" />;
    case "book":
      return (
        <>
          <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z" />
          <path d="M9 8h6M9 12h5" />
        </>
      );
    case "dot":
      return <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />;
  }
};

export const Icon = ({ name, size = 18 }: { name: IconName; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="icon"
    aria-hidden="true"
  >
    {inner(name)}
  </svg>
);
