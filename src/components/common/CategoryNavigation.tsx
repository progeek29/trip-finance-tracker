import React from 'react';
import './CategoryNavigation.css';

export interface CategoryItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface CategoryNavigationProps {
  categories: CategoryItem[];
  activeCategory: string;
  onCategoryChange: (id: string) => void;
}

/**
 * Reusable horizontal category pills (Airbnb pattern).
 * Names/icons come from props — no hardcoding, no business logic.
 */
export const CategoryNavigation: React.FC<CategoryNavigationProps> = ({
  categories,
  activeCategory,
  onCategoryChange,
}) => {
  return (
    <div className="category-nav" role="tablist" aria-label="Categories">
      {categories.map((category) => (
        <button
          key={category.id}
          role="tab"
          aria-selected={activeCategory === category.id}
          className={`category-pill ${activeCategory === category.id ? 'active' : ''}`}
          onClick={() => onCategoryChange(category.id)}
        >
          {category.icon ? (
            <span className="category-icon" aria-hidden>
              {category.icon}
            </span>
          ) : null}
          <span>{category.label}</span>
        </button>
      ))}
    </div>
  );
};
