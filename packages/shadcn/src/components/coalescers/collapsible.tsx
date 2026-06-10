import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";

type CollapsibleComponent = typeof Collapsible & {
  Content: typeof CollapsibleContent;
  Trigger: typeof CollapsibleTrigger;
};

const AugmentedCollapsible = Collapsible as CollapsibleComponent;

AugmentedCollapsible.Content = CollapsibleContent;
AugmentedCollapsible.Trigger = CollapsibleTrigger;

export { AugmentedCollapsible as Collapsible };
