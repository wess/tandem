import type { ReactNode } from "react";
import { closeModal } from "../state/actions.ts";
import { Icon } from "./icon.tsx";

export const Modal = ({
  title,
  subtitle,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) => (
  <div className="overlay" onMouseDown={closeModal}>
    <div className={`modal${wide ? " wide" : ""}`} onMouseDown={(e) => e.stopPropagation()}>
      <header className="modalhead">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="iconbtn" onClick={closeModal} title="Close">
          <Icon name="close" size={18} />
        </button>
      </header>
      <div className="modalbody">{children}</div>
    </div>
  </div>
);
