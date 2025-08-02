import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDiscountPlans() {
  try {
    console.log('🔍 Checking all discount plans...\n');
    
    const plans = await prisma.discountPlan.findMany({
      include: {
        rules: true
      }
    });
    
    console.log(`📊 Found ${plans.length} discount plans:\n`);
    
    plans.forEach((plan, index) => {
      console.log(`Plan ${index + 1}:`);
      console.log(`  ID: ${plan.id}`);
      console.log(`  Name: ${plan.name}`);
      console.log(`  Target Type: ${plan.targetType}`);
      console.log(`  Target Key: ${plan.targetKey}`);
      console.log(`  Created: ${plan.createdAt}`);
      console.log(`  Updated: ${plan.updatedAt}`);
      console.log(`  Rules: ${plan.rules.length}`);
      
      if (plan.rules.length > 0) {
        console.log('  Rule Details:');
        plan.rules.forEach((rule, ruleIndex) => {
          console.log(`    Rule ${ruleIndex + 1}:`);
          console.log(`      ID: ${rule.id}`);
          console.log(`      Category ID: ${rule.categoryId}`);
          console.log(`      Percent Off: ${rule.percentOff}%`);
        });
      }
      console.log('');
    });
    
    // Also check segments
    console.log('🔍 Checking segments...\n');
    const segments = await prisma.segment.findMany();
    console.log(`📊 Found ${segments.length} segments:\n`);
    segments.forEach((segment, index) => {
      console.log(`Segment ${index + 1}:`);
      console.log(`  ID: ${segment.id}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDiscountPlans(); 