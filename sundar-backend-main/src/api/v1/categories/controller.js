// 📂 CATEGORIES CONTROLLER
const { connectToDB } = require('../../../config/database');
const logger = require('../../../utils/logger');
const { sendErrorResponse, createError } = require('../../../middleware/error.handler');
const cacheService = require('../../../utils/cache-service');

/**
 * Get all categories
 * GET /api/v1/categories
 */
const getAllCategories = async (req, res) => {
  try {
    const cacheKey = 'categories:all:with_count';
    
    const categoriesWithCount = await cacheService.getCached(
      cacheKey,
      async () => {
        const db = await connectToDB();
        const productsCollection = db.collection('products');

        return await productsCollection.aggregate([
          {
            $match: { active: { $ne: false } }
          },
          {
            $group: {
              _id: "$category",
              productCount: { $sum: 1 }
            }
          },
          {
            $project: {
              _id: 0,
              name: "$_id",
              slug: { $toLower: { $replaceOne: { input: "$_id", find: " ", replacement: "-" } } },
              productCount: 1
            }
          },
          {
            $sort: { productCount: -1 }
          }
        ]).toArray();
      },
      { ttl: 3600 } // Cache for 1 hour
    );

    return res.status(200).json({
      success: true,
      data: categoriesWithCount,
      count: categoriesWithCount.length
    });
  } catch (error) {
    logger.error('Get categories error:', error);
    return sendErrorResponse(res, createError.internalServerError(), req.requestId);
  }
};

/**
 * Get products by category
 * GET /api/v1/categories/:category/products
 */
const getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const cacheKey = `categories:${category}:products:${page}:${limit}`;

    const result = await cacheService.getCached(
      cacheKey,
      async () => {
        const db = await connectToDB();
        const productsCollection = db.collection('products');
        const skip = (page - 1) * limit;

        const regex = new RegExp(`^${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

        const [products, total] = await Promise.all([
          productsCollection.find({ category: regex, active: { $ne: false } })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
          productsCollection.countDocuments({ category: regex, active: { $ne: false } })
        ]);

        return {
          products: products.map(item => ({
            ...item,
            id: item._id ? item._id.toString() : item.id
          })),
          total
        };
      },
      { ttl: 300 }
    );

    return res.status(200).json({
      success: true,
      data: result.products,
      pagination: {
        page,
        limit,
        total: result.total
      }
    });
  } catch (error) {
    logger.error('Get products by category error:', error);
    return sendErrorResponse(res, createError.internalServerError(), req.requestId);
  }
};

module.exports = {
  getAllCategories,
  getProductsByCategory
};
