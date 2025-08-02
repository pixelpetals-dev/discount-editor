import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixDiscountPlan() {
  try {
    console.log('🔧 Fixing discount plan target key...\n');
    
    // Find the existing discount plan
    const existingPlan = await prisma.discountPlan.findFirst({
      where: {
        name: "New Vip"
      }
    });
    
    if (!existingPlan) {
      console.log('❌ No discount plan found with name "New Vip"');
      return;
    }
    
    console.log('📊 Current plan:');
    console.log(`  ID: ${existingPlan.id}`);
    console.log(`  Name: ${existingPlan.name}`);
    console.log(`  Current Target Key: ${existingPlan.targetKey}`);
    
    // Update the target key to use the segment name instead of GID
    const updatedPlan = await prisma.discountPlan.update({
      where: {
        id: existingPlan.id
      },
      data: {
        targetKey: "Vip" // Use the segment name that matches customer tags
      }
    });
    
    console.log(`\n✅ Updated plan:`);
    console.log(`  New Target Key: ${updatedPlan.targetKey}`);
    console.log('\n🎉 Now the API should be able to match customer tag "Vip" with target key "Vip"!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixDiscountPlan(); 