/** Stand-in for the views M8–M13 fill in. Names the module that will replace it. */
export function Placeholder({ view, module }: { view: string; module: string }) {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-10 py-8 text-center">
        <div className="text-[15px] font-semibold text-slate-700">{view}</div>
        <p className="mt-1.5 text-[13px] text-slate-500">
          The app shell is in place. This view arrives in <span className="font-mono text-slate-600">{module}</span>.
        </p>
      </div>
    </div>
  );
}
