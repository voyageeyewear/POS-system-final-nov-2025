import { Check, Package, Minus } from 'lucide-react';

export default function ProductCard({ product, isSelected, selectionCount = 0, onToggle, onRemove }) {
  
  const isOutOfStock = product.quantity === 0;
  
  const handleRemove = (e) => {
    e.stopPropagation(); // Prevent triggering onToggle
    onRemove(product);
  };
  
  const handleClick = () => {
    if (!isOutOfStock) {
      onToggle(product);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`bg-white rounded-lg shadow-sm border-2 transition w-full h-auto relative ${
        isOutOfStock 
          ? 'border-gray-200 opacity-60 cursor-not-allowed' 
          : isSelected 
            ? 'border-primary-500 bg-primary-50 cursor-pointer' 
            : 'border-gray-200 hover:shadow-md cursor-pointer'
      }`}
    >
      {/* Product Image */}
      <div className="h-24 sm:h-32 bg-gray-100 relative overflow-hidden rounded-t-lg">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className={`w-full h-full object-cover ${isOutOfStock ? 'grayscale' : ''}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-8 h-8 text-gray-300" />
          </div>
        )}
        
        {/* Out of Stock Overlay */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <span className="bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold">
              Out of Stock
            </span>
          </div>
        )}
        
        {/* Stock Badge */}
        <div className="absolute top-1 right-1">
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
            product.quantity > 10
              ? 'bg-green-100 text-green-800'
              : product.quantity > 0
              ? 'bg-yellow-100 text-yellow-800'
              : 'bg-red-100 text-red-800'
          }`}>
            {product.quantity > 0 ? `${product.quantity} in stock` : 'Not available'}
          </span>
        </div>
        
            {/* Selection Indicator */}
            {isSelected && (
              <>
                <div className="absolute top-1 left-1 bg-primary-500 rounded-full p-1 min-w-[24px] flex items-center justify-center">
                  {selectionCount > 1 ? (
                    <span className="text-white text-xs font-bold px-1">{selectionCount}</span>
                  ) : (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
                
                {/* Remove Button */}
                <button
                  onClick={handleRemove}
                  className="absolute top-1 left-8 bg-red-500 hover:bg-red-600 rounded-full p-1 transition z-10"
                  title="Remove one"
                >
                  <Minus className="w-3 h-3 text-white" />
                </button>
              </>
            )}
      </div>

      {/* Product Info */}
      <div className="p-2 sm:p-3">
        <h3 className="font-semibold text-gray-800 text-xs sm:text-sm mb-0.5 line-clamp-2" style={{ minHeight: '2rem' }}>
          {product.name}
        </h3>
        <p className="text-[10px] sm:text-xs text-gray-500 mb-2">SKU: {product.sku}</p>
        
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex-1">
            <p className="text-sm sm:text-base font-bold text-gray-900 leading-tight">
              ₹{product.price.toFixed(2)}
            </p>
            <p className="text-[10px] sm:text-xs text-gray-500">
              {product.taxRate}% tax
            </p>
          </div>

          {isSelected && (
            <div className="bg-primary-500 text-white px-2 py-1 rounded-full flex-shrink-0 flex items-center gap-1">
              {selectionCount > 1 ? (
                <span className="text-xs font-bold">×{selectionCount}</span>
              ) : (
                <Check className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

