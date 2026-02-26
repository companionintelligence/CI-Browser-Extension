import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/accordion";

type AccordionComponent = typeof Accordion & {
  Content: typeof AccordionContent;
  Item: typeof AccordionItem;
  Trigger: typeof AccordionTrigger;
};

const AugmentedAccordion = Accordion as AccordionComponent;

AugmentedAccordion.Content = AccordionContent;
AugmentedAccordion.Item = AccordionItem;
AugmentedAccordion.Trigger = AccordionTrigger;

export { AugmentedAccordion as Accordion };
