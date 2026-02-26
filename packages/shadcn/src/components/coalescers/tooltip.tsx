import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../ui/tooltip';

type TooltipComponent = typeof Tooltip & {
  Trigger: typeof TooltipTrigger;
  Content: typeof TooltipContent;
  Provider: typeof TooltipProvider;
};

const AugmentedTooltip = Tooltip as TooltipComponent;

AugmentedTooltip.Trigger = TooltipTrigger;
AugmentedTooltip.Content = TooltipContent;
AugmentedTooltip.Provider = TooltipProvider;

export { AugmentedTooltip as Tooltip };
