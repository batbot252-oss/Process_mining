"use client";

import dynamic from "next/dynamic";

const ProcessExplorer = dynamic(() => import("../components/ProcessExplorer"), {
  ssr: false,
});

export default function ClientProcessExplorer() {
  return <ProcessExplorer />;
}
