import { ArrowRight } from "lucide-react";
import exploreProductsImage from "../../assets/ExploreProducts.png";

export function ExploreProductsBanner() {
  return (
    <section className="site-section explore-products-banner" aria-label="Explore products">
      <div className="explore-products-banner__inner">
        <div className="explore-products-banner__visual">
          <span className="explore-products-banner__glow" aria-hidden="true" />
          <img
            className="explore-products-banner__image"
            src={exploreProductsImage}
            alt="Browse electronics products on Prakash Electronics"
            width={720}
            height={560}
            loading="lazy"
            decoding="async"
          />
        </div>

        <a className="explore-products-banner__button" href="/products">
          Explore Products
          <ArrowRight size={18} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
