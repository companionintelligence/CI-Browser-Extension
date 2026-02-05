import { HoverCard, HoverCardTrigger, HoverCardContent } from '../ui/hover-card';

type HoverCardComponent = typeof HoverCard & {
  Trigger: typeof HoverCardTrigger;
  Content: typeof HoverCardContent;
};

const AugmentedHoverCard = HoverCard as HoverCardComponent;

AugmentedHoverCard.Trigger = HoverCardTrigger;
AugmentedHoverCard.Content = HoverCardContent;

export { AugmentedHoverCard as HoverCard };
