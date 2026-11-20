import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] text-sm font-medium transition-[color,background-color,box-shadow,transform,opacity] duration-[var(--motion-quick)] ease-[var(--ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-fg hover:bg-tile disabled:bg-surface-2 disabled:text-subtle aria-disabled:bg-surface-2 aria-disabled:text-subtle aria-disabled:hover:bg-surface-2",
        secondary:
          "bg-surface-2 text-fg hover:bg-border disabled:text-subtle disabled:hover:bg-surface-2 aria-disabled:text-subtle aria-disabled:hover:bg-surface-2",
        outline:
          "bg-surface text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)] disabled:bg-surface-2 disabled:text-subtle disabled:hover:shadow-[var(--shadow-border)] aria-disabled:bg-surface-2 aria-disabled:text-subtle aria-disabled:hover:shadow-[var(--shadow-border)]",
        ghost: "text-fg hover:bg-surface-2 disabled:text-subtle disabled:hover:bg-surface-2",
        success:
          "bg-success text-success-fg hover:opacity-90 disabled:bg-surface-2 disabled:text-subtle disabled:hover:bg-surface-2 disabled:hover:opacity-100 aria-disabled:bg-surface-2 aria-disabled:text-subtle aria-disabled:hover:bg-surface-2 aria-disabled:hover:opacity-100",
        danger:
          "bg-danger text-danger-fg hover:opacity-90 disabled:bg-surface-2 disabled:text-subtle disabled:hover:bg-surface-2 disabled:hover:opacity-100 aria-disabled:bg-surface-2 aria-disabled:text-subtle aria-disabled:hover:bg-surface-2 aria-disabled:hover:opacity-100",
      },
      size: {
        default: "h-11 min-h-11 px-4",
        sm: "h-9 min-h-9 px-3 text-sm",
        lg: "h-12 min-h-12 px-5 text-base",
        icon: "size-11 min-h-11 min-w-11",
        "icon-lg": "size-12 min-h-12 min-w-12 [&_svg]:size-5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
