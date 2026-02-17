import dynamic from "next/dynamic";

const ProcessExplorer = dynamic(() => import("../components/ProcessExplorer"), {
  ssr: false,
});

export default function Page() {
  return <ProcessExplorer />;
}
