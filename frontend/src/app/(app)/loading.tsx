export default function AppLoading() {
  return (
    <div className="flex-1 space-y-6 p-6 max-w-7xl mx-auto animate-pulse">
      {/* Subtle header skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-md bg-muted/70" />
        <div className="h-4 w-72 rounded bg-muted/40" />
      </div>

      {/* Grid skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-2">
        <div className="h-36 rounded-xl border bg-card/50 p-4 space-y-3">
          <div className="h-4 w-28 rounded bg-muted/70" />
          <div className="h-3 w-full rounded bg-muted/40" />
          <div className="h-3 w-3/4 rounded bg-muted/30" />
          <div className="flex gap-2 pt-2">
            <div className="h-5 w-16 rounded-full bg-muted/50" />
            <div className="h-5 w-14 rounded-full bg-muted/40" />
          </div>
        </div>
        <div className="h-36 rounded-xl border bg-card/50 p-4 space-y-3">
          <div className="h-4 w-32 rounded bg-muted/70" />
          <div className="h-3 w-full rounded bg-muted/40" />
          <div className="h-3 w-2/3 rounded bg-muted/30" />
          <div className="flex gap-2 pt-2">
            <div className="h-5 w-14 rounded-full bg-muted/50" />
            <div className="h-5 w-16 rounded-full bg-muted/40" />
          </div>
        </div>
        <div className="h-36 rounded-xl border bg-card/50 p-4 space-y-3">
          <div className="h-4 w-24 rounded bg-muted/70" />
          <div className="h-3 w-full rounded bg-muted/40" />
          <div className="h-3 w-4/5 rounded bg-muted/30" />
          <div className="flex gap-2 pt-2">
            <div className="h-5 w-16 rounded-full bg-muted/50" />
            <div className="h-5 w-12 rounded-full bg-muted/40" />
          </div>
        </div>
      </div>

      {/* Main card skeleton */}
      <div className="h-72 rounded-xl border bg-card/40 p-6 space-y-4">
        <div className="h-5 w-40 rounded bg-muted/70" />
        <div className="h-4 w-full rounded bg-muted/30" />
        <div className="h-4 w-5/6 rounded bg-muted/30" />
        <div className="h-4 w-2/3 rounded bg-muted/30" />
      </div>
    </div>
  );
}
