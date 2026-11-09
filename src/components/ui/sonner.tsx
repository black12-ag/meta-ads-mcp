import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            // dark in both themes, so it stands apart from the page
            "group toast group-[.toaster]:rounded-xl group-[.toaster]:bg-ink group-[.toaster]:text-white group-[.toaster]:border-white/10 group-[.toaster]:shadow-[0_16px_40px_-12px_rgb(0_0_0/0.5)] dark:group-[.toaster]:bg-accent",
          description: "group-[.toast]:text-white/70",
          actionButton:
            "group-[.toast]:bg-brand group-[.toast]:text-white group-[.toast]:rounded-full",
          cancelButton:
            "group-[.toast]:bg-white/10 group-[.toast]:text-white/80 group-[.toast]:rounded-full",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
