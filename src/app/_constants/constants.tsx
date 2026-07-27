import React from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const APP_NAME = "atlas";
export const APP_VERSION = "1.0.0";
export const DEFAULT_LANGUAGE = "en";
export const API_BASE_URL = "https://api.myawesomeapp.com/v1";
export const ACTIONS = {
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  FETCH_USER: "FETCH_USER",
  UPDATE_PROFILE: "UPDATE_PROFILE",
};
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  DASHBOARD: "/dashboard",
  PROFILE: "/profile",
};

// COPY
export const ATLAS_NAME = "Atlas";
export const ATLAS_VERSION = "1.0.0";
export const ATLAS_DEFAULT_LANGUAGE = "en";
export const ATLAS_API_BASE_URL = "https://api.atlas.com/v1";
export const ATLAS_ACTIONS = {
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  FETCH_USER: "FETCH_USER",
  UPDATE_PROFILE: "UPDATE_PROFILE",
};

export const ATLAS_PROMPT_HEADER = "What are we building today?";
export const FEATURES_HEADER = "An agentic coding workspace";
export const FEATURES_SUBHEADER_DESC = "Atlas gives you and your agents a shared cloud machine to work in — real files, a real shell, a real URL. Start from the browser or the CLI, and pick the work back up wherever you left it.";






// REUSABLE COMPONENT STUBS
interface AppLogoAndNameProps {
  className?: string;
  /** Where the mark points. Defaults to the marketing home. */
  href?: string;
  /** Fires on click — lets a drawer close itself before the route changes. */
  onClick?: () => void;
}

/**
 * The Atlas mark. It renders its own <Link>, so never wrap it in another one:
 * nested anchors are invalid HTML and React throws a hydration error on them.
 */
export function APP_LOGO_AND_NAME({
  className = "",
  href = "/",
  onClick,
}: AppLogoAndNameProps): React.ReactNode {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "text-foreground flex items-center gap-2 font-normal tracking-tight text-balance [&_text]:text-lg",
        className,
      )}
    >
      <Image src="/logo.svg" alt="Atlas Labs" width={32} height={32} />
      <h1 className="font-heading text-foreground text-2xl font-normal tracking-tight text-balance">
        {APP_NAME}
      </h1>
    </Link>
  );
}