# Personalized Category-Based Discount Module for Shopify (Remix)

A comprehensive Shopify app that provides segment-aware, category-level discounts with a modern Remix-based architecture.

## 📋 **Features**

### **Core Functionality**
- **Segment-Based Discounts**: Target specific customer segments (VIP, Gold, etc.)
- **Category-Level Rules**: Apply discounts to entire product collections
- **Dynamic Pricing**: Real-time price calculations based on customer segments
- **Admin Interface**: Full CRUD operations for discount plans and rules
- **Storefront Integration**: Display personalized prices on product pages
- **Checkout Integration**: Apply discounts during checkout process

### **Technical Features**
- **Remix v2**: Modern SSR framework with excellent DX
- **Shopify App Platform**: Embedded app with App Bridge integration
- **Prisma ORM**: Type-safe database operations with SQLite
- **Shopify Polaris**: Consistent UI components
- **GraphQL API**: Efficient data fetching from Shopify
- **Automatic Authentication**: No manual store configuration needed

## 🏗️ **Architecture**

### **Database Schema**
```sql
-- Core discount management
DiscountPlan (id, name, targetType, targetKey)
Rule (id, categoryId, percentOff, discountPlanId)

-- Customer segmentation
Customer (id, email)
Segment (id)
CustomerSegment (customerId, segmentId)

-- Shopify session management
Session (id, shop, accessToken, scope, expires, isOnline)
```

### **Key Routes**
- `/app/discount-plans` - Admin interface for managing discount plans
- `/app/discount-plans/:id` - Edit specific discount plans
- `/api/price-lookup` - Storefront API for personalized pricing
- `/api/create-draft-order` - Checkout integration for discounts
- `/app/store-info` - View automatic store configuration

## 🚀 **Getting Started**

### **Prerequisites**
- Node.js 18+ 
- Shopify Partner account
- Development store

### **Installation**
```bash
# Clone and install dependencies
git clone <repository>
cd shopify
npm install

# Set up database
npx prisma generate
npx prisma db push

# Start development server
npm run dev
```

### **Environment Setup**
The app automatically gets store information when installed. No manual `.env` configuration needed for store-specific data.

## 🔧 **Development**

### **Running the App**
```bash
# Development mode
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

### **Database Operations**
```bash
# Generate Prisma client
npx prisma generate

# Push schema changes
npx prisma db push

# View database
npx prisma studio
```

## 📊 **API Endpoints**

### **Admin APIs**
- `GET /app/discount-plans` - List all discount plans
- `POST /app/discount-plans` - Create new discount plan
- `PUT /app/discount-plans/:id` - Update discount plan
- `DELETE /app/discount-plans/:id` - Delete discount plan

### **Storefront APIs**
- `GET /api/price-lookup` - Get personalized prices for products
- `POST /api/create-draft-order` - Create discounted draft order
- `POST /api/calculate-discount` - Calculate applicable discounts

### **Utility APIs**
- `GET /api/shopify-data` - Universal endpoint for Shopify data

## 🎨 **UI Components**

### **Admin Interface**
- **Discount Plans List**: View and manage all discount plans
- **Create/Edit Forms**: Inline forms with validation
- **Segment Selection**: Dynamic dropdown with Shopify segments
- **Collection Selection**: Searchable collection picker
- **Rule Management**: Add/remove discount rules

### **Storefront Integration**
- **Dynamic Pricing**: Real-time price updates
- **Segment Detection**: Automatic customer segment identification
- **Price Display**: Original price with strikethrough, discounted price highlighted

## 🔒 **Security & Permissions**

### **Required Scopes**
- `read_customers` - Access customer data and tags
- `write_draft_orders` - Create discounted orders
- `write_products` - Access product and collection data

### **Authentication**
- **Automatic**: Shopify handles OAuth flow
- **Session Management**: Secure session storage with Prisma
- **Token Refresh**: Automatic access token renewal

## 🌐 **Deployment**

### **Shopify CLI Deployment**
```bash
# Deploy to Shopify
npx shopify app deploy

# Configure app
npx shopify app config link
```

### **Environment Variables**
Automatically set by Shopify CLI and deployment platforms:
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SCOPES`
- `SHOPIFY_APP_URL`

## 📈 **Usage Examples**

### **Creating a Discount Plan**
1. Navigate to `/app/discount-plans`
2. Click "Add Discount Plan"
3. Select target segment (VIP, Gold, etc.)
4. Add rules for specific collections
5. Set discount percentages
6. Save and activate

### **Testing Personalized Pricing**
1. Create discount plan for a segment
2. Add customer to segment via tags
3. Visit product page as that customer
4. See personalized discounted price

### **Checkout Integration**
1. Add products to cart
2. Customer with segment discount
3. Checkout process applies discounts
4. Draft order created with custom pricing

## 🔍 **Troubleshooting**

### **Common Issues**
- **Segments not loading**: Ensure `read_customers` scope is granted
- **Prices not updating**: Check customer tags and segment matching
- **Authentication errors**: Reinstall app to refresh access tokens

### **Debug Tools**
- `/api/test-cors` - Test CORS headers
- Browser console logs for frontend debugging

## 🤝 **Contributing**

1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

## 📄 **License**

This project is licensed under the MIT License.

---

**Built with ❤️ using Remix, Shopify App Platform, and Prisma**
