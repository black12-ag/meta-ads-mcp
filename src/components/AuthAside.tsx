import opsRoom from "@/assets/ops-room.jpg";

/** Sign-in side panel. Always dark, like the footer, in both themes. */
export function AuthAside() {
  return (
    <aside className="relative hidden overflow-hidden bg-ink text-white lg:block">
      <img
        src={opsRoom}
        alt="Media buying workspace at night lit by campaign dashboards"
        className="absolute inset-0 size-full object-cover opacity-50 [filter:hue-rotate(150deg)_saturate(1.1)]"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/20" />
      <div
        aria-hidden
        className="absolute -bottom-40 -left-40 size-[32rem] rounded-full bg-[radial-gradient(circle,hsl(var(--brand)/0.35)_0%,transparent_65%)] blur-2xl"
      />

      <div className="relative flex h-full flex-col justify-end gap-8 p-12">
        <p className="max-w-md text-[clamp(1.75rem,2.6vw,2.5rem)] leading-[1.1] font-extrabold tracking-[-0.035em]">
          One console for every ad account you touch.
        </p>
      </div>
    </aside>
  );
}
