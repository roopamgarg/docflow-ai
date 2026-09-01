import { SiteHeader } from "@/components/layout/SiteHeader";

/**
 * The landing route. Placeholder body: the hero, the dropzone and the file
 * rules are ticket 010's, and the processing and error states are 011's — both
 * reach the state layer through `useDocument()`, which the root layout mounts
 * above this page.
 */
export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <SiteHeader />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 py-12 lg:px-8">
        <p className="text-body text-muted-foreground">
          Upload a document to extract its data. Nothing leaves your machine.
        </p>
      </main>
    </div>
  );
}
