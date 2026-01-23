import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";

const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root
    shouldScaleBackground={shouldScaleBackground}
    {...props}
  />
);
Drawer.displayName = "Drawer";

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = DrawerPrimitive.Portal;

const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/80 backdrop-blur-sm", className)}
    {...props}
  />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> & {
    containerClassName?: string;
  }
>(({ className, containerClassName, children, ...props }, ref) => {
  const isWarehouseDrawer = containerClassName?.includes('warehouse-entries-drawer');
  
  React.useEffect(() => {
    // Apply container class to the parent for CSS targeting
    if (isWarehouseDrawer) {
      const drawerRoot = document.querySelector('[data-vaul-drawer]') as HTMLElement;
      if (drawerRoot && !drawerRoot.classList.contains('warehouse-entries-drawer')) {
        drawerRoot.classList.add('warehouse-entries-drawer');
      }
    }
  }, [isWarehouseDrawer]);

  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        ref={ref}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex h-auto max-h-[85vh] flex-col rounded-t-[10px] border bg-background shadow-lg",
          "sm:mt-24",
          // Enhanced warehouse-entries-drawer styling for production
          isWarehouseDrawer && [
            // Desktop: 75% width from 25% left
            "md:left-[25%] md:right-0 md:inset-x-auto md:w-[75%] md:max-w-[75%]",
            "md:top-0 md:bottom-0 md:mt-0 md:h-full md:max-h-full",
            "md:rounded-l-[10px] md:rounded-r-none md:rounded-t-none",
            // Mobile: Full width with controlled height
            "max-md:left-0 max-md:right-0 max-md:w-full max-md:max-w-full",
            "max-md:max-h-[90vh] max-md:h-[90vh]",
            // Ensure proper positioning
            "!important"
          ],
          className,
        )}
        style={{
          // Inline styles to ensure they work in production
          ...(isWarehouseDrawer ? {
            position: 'fixed',
            zIndex: 50,
            ...(window.innerWidth >= 768 ? {
              left: '25%',
              right: '0',
              width: '75%',
              maxWidth: '75%',
              top: '0',
              bottom: '0',
              height: '100%',
              maxHeight: '100%',
              borderRadius: '0.625rem 0 0 0.625rem',
            } : {
              left: '0',
              right: '0',
              width: '100%',
              maxWidth: '100%',
              height: '90vh',
              maxHeight: '90vh',
              borderRadius: '0.625rem 0.625rem 0 0',
            })
          } : {}),
          ...props.style
        }}
        {...props}
      >
        <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
});
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
    {...props}
  />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mt-auto flex flex-col gap-2 p-4", className)}
    {...props}
  />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className,
    )}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
