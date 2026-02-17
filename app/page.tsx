// app/page.tsx
import ProcessExplorer from "../components/ProcessExplorer";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main style={{ minHeight: "100vh" }}>
      <ProcessExplorer />
    </main>
  );
}
