import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '../ui/carousel';

type CarouselComponent = typeof Carousel & {
  Content: typeof CarouselContent;
  Item: typeof CarouselItem;
  Previous: typeof CarouselPrevious;
  Next: typeof CarouselNext;
};

const AugmentedCarousel = Carousel as CarouselComponent;

AugmentedCarousel.Content = CarouselContent;
AugmentedCarousel.Item = CarouselItem;
AugmentedCarousel.Previous = CarouselPrevious;
AugmentedCarousel.Next = CarouselNext;

export { AugmentedCarousel as Carousel, type CarouselApi };
