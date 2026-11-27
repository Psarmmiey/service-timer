import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { Check, ChevronDown, X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { forwardRef } from "react";
import { twMerge } from "tailwind-merge";
import { Toaster as Sonner } from "sonner";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "border-zinc-950 bg-zinc-950 text-zinc-50 hover:bg-zinc-800",
        outline: "bg-white",
        ghost: "border-transparent bg-transparent hover:bg-zinc-100",
        destructive: "border-red-700 bg-red-700 text-white hover:bg-red-800",
      },
      size: {
        default: "h-9",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-5 text-base",
        icon: "size-9 p-0",
      },
    },
    defaultVariants: { variant: "outline", size: "default" },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export const Badge = forwardRef<HTMLSpanElement, ComponentProps<"span">>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn("inline-flex h-6 items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 text-xs font-semibold text-zinc-700", className)}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn("flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-950/10", className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Switch = forwardRef<HTMLButtonElement, ComponentProps<typeof SwitchPrimitive.Root>>(
  ({ className, ...props }, ref) => (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn("peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-zinc-200 transition-colors data-[state=checked]:bg-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2", className)}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  ),
);
Switch.displayName = "Switch";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  children,
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-zinc-950/60" />
      <DialogPrimitive.Content
        className={cn("fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-200 bg-white p-6 shadow-2xl focus:outline-none", className)}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-zinc-500 hover:bg-zinc-100" aria-label="Close">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogTitle = forwardRef<HTMLHeadingElement, ComponentProps<typeof DialogPrimitive.Title>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold", className)} {...props} />
  ),
);
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = forwardRef<HTMLParagraphElement, ComponentProps<typeof DialogPrimitive.Description>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Description ref={ref} className={cn("mt-1.5 text-sm text-zinc-500", className)} {...props} />
  ),
);
DialogDescription.displayName = "DialogDescription";

export const ToggleGroup = ToggleGroupPrimitive.Root;

export const ToggleGroupItem = forwardRef<HTMLButtonElement, ComponentProps<typeof ToggleGroupPrimitive.Item>>(
  ({ className, ...props }, ref) => (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn("h-8 shrink-0 whitespace-nowrap rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium hover:bg-zinc-100 data-[state=on]:border-zinc-400 data-[state=on]:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950", className)}
      {...props}
    />
  ),
);
ToggleGroupItem.displayName = "ToggleGroupItem";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
export const SelectContent = forwardRef<HTMLDivElement, ComponentProps<typeof SelectPrimitive.Content>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position="popper"
        className={cn("z-50 min-w-48 overflow-hidden rounded-md border border-zinc-200 bg-white p-1 shadow-lg", className)}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  ),
);
SelectContent.displayName = "SelectContent";

export const SelectTrigger = forwardRef<HTMLButtonElement, ComponentProps<typeof SelectPrimitive.Trigger>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn("flex h-9 items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-950/20", className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon><ChevronDown className="size-4 text-zinc-500" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  ),
);
SelectTrigger.displayName = "SelectTrigger";

export const SelectItem = forwardRef<HTMLDivElement, ComponentProps<typeof SelectPrimitive.Item>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Item
      ref={ref}
      className={cn("relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-zinc-100", className)}
      {...props}
    >
      <span className="absolute left-2"><SelectPrimitive.ItemIndicator><Check className="size-4" /></SelectPrimitive.ItemIndicator></span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  ),
);
SelectItem.displayName = "SelectItem";

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content sideOffset={6} className="z-50 rounded-md bg-zinc-950 px-2 py-1 text-xs text-white">
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export function Toaster() {
  return <Sonner position="bottom-right" richColors closeButton />;
}
