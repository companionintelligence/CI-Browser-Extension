import { useEffect, useRef, type ReactNode } from "react";
import { Button, useToast } from "@ci/shadcn";
import { ChevronLeft } from "@ci/shadcn/icons";
import logo from "@/assets/logo.png";
import { copy } from "../copy";
import { useRouter } from "../routes";
import { StatusDot, type DotTone } from "./StatusDot";

/** Hidden developer unlock: 7 title clicks in 2.5 s (Alt+Shift+Period works everywhere). */
const DEV_CLICKS_NEEDED = 7;
const DEV_CLICK_WINDOW_MS = 2500;

export function PopupHeader({
  title,
  back,
  status,
  right,
}: {
  title: string;
  /** Pushed screens get the back chevron; root screens get the brand tile. */
  back?: boolean;
  /** Corner dot tone on the brand tile (ambient status). */
  status?: DotTone;
  right?: ReactNode;
}) {
  const { pop, push } = useRouter();
  const { toast } = useToast();
  const clicksRef = useRef<{ n: number; t: number }>({ n: 0, t: 0 });
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Focus follows the screen change so screen readers announce where we are.
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  const handleTitleClick = () => {
    const now = Date.now();
    const clicks = clicksRef.current;
    const next =
      now - clicks.t > DEV_CLICK_WINDOW_MS
        ? { n: 1, t: now }
        : { n: clicks.n + 1, t: clicks.t };
    clicksRef.current = next;
    if (next.n >= DEV_CLICKS_NEEDED) {
      clicksRef.current = { n: 0, t: 0 };
      toast(copy.dev.unlocked);
      push("dev");
    }
  };

  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/85 px-2 backdrop-blur-sm">
      {back ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={copy.common.back}
          onClick={pop}
        >
          <ChevronLeft className="size-4" strokeWidth={1.75} />
        </Button>
      ) : (
        <span className="relative ml-1 shrink-0">
          <img
            src={logo}
            alt=""
            className="size-5 rounded-sm"
            draggable={false}
          />
          {status && (
            <StatusDot
              tone={status}
              className="absolute -right-0.5 -bottom-0.5 ring-2 ring-background"
            />
          )}
        </span>
      )}
      <h1
        ref={titleRef}
        tabIndex={-1}
        onClick={back ? undefined : handleTitleClick}
        className="min-w-0 flex-1 truncate text-sm font-semibold select-none outline-none"
      >
        {title}
      </h1>
      {right}
    </header>
  );
}
