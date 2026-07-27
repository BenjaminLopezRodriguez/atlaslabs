import React from "react";
import Image from "next/image";
import Link from "next/link";

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

export const ATLAS_PROMPT_HEADER = "Let's get started";
export const FEATURES_HEADER = "Aiming to make agentic work better";
export const FEATURES_SUBHEADER_DESC = "We're a research lab focused on safe and reliable agentic work. We develop tooling and infrastructure to help you build or research with artificial intelligence.";






// REUSABLE COMPONENT STUBS
export function APP_LOGO_AND_NAME(): React.ReactNode {
  return (
    <Link
      href="/"
      className="text-foreground flex items-center gap-2 font-normal tracking-tight text-balance [&_text]:text-lg"
    >
      <Image src="/logo.svg" alt="Atlas Labs" width={32} height={32} />
      <h1 className="font-heading text-foreground text-2xl font-normal tracking-tight text-balance">
        {APP_NAME}
      </h1>
    </Link>
  );
}
