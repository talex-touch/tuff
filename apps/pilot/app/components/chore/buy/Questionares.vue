<script setup lang="ts">
const props = defineProps<{
  modelValue?: boolean
}>()
</script>

<template>
  <div class="CheckoutPage-Content-Info Questionares">
    <p>常见问题</p>
    <el-collapse accordion>
      <el-collapse-item title="随时取消政策" name="plan_change">
        在科塔锐行，我们深知计划可能随时发生变化。为此，我们特别设计了一套取消政策，旨在为您带来最大的灵活性与安心保障。当您选择我们时，您将享有充分的自由度来调整或取消预订，无需担心任何取消费用。我们的政策允许您在购买后<span
          font-bold
        >3 小时</span>内免费修改订单，确保您的计划能够灵活适应各种突发状况。<el-link
          target="_blank" :href="getProtocolUrl('plan_change')"
          type="primary"
        >
          了解更多
        </el-link>
      </el-collapse-item>
      <el-collapse-item title="客服热线" name="customer_service">
        <p>
          请关注公众号“科塔锐行科技“，发送”客服“获取客服联系方式。
        </p>
      </el-collapse-item>
      <el-collapse-item title="怎么开发票" name="bill">
        <p>
          普票：请您登陆科塔智爱网页端 - 点击左下角个人头像 - 点击”账户余额“ - 点击”订单管理“，按照系统提示填写发票相关信息。
        </p>
        <p>
          专票：暂不支持电子专票，如需开局纸质版专票请准备好相关信息联系客服。
        </p>
      </el-collapse-item>
      <el-collapse-item title="订阅计划有效期间账号被封怎么办" name="banned">
        <p>
          用户处于订阅计划有效期间账号被封后将无法使用账号权益，若开通连续包月/包年，自动续费等，需自行在相关位置取消相关服务。
        </p>
      </el-collapse-item>
      <el-collapse-item title="购买时提示需要实名认证" name="verified">
        <p>
          为遵循国家法律法规，进行安全保护，需您先完成实名认证才能购买。未成年人请在监护人同意后再进行实名认证。
        </p>
        <p>若您为手机号登录默认实名认证已完成。</p>
      </el-collapse-item>
      <el-collapse-item title="青春畅享+是什么" name="youth">
        <p>青春畅享+是科塔智爱推出的特别针对于学生的优惠，处于14——28岁的青年学生通过完成学生认证可享受优惠。（未成年人默认享有权益）</p>
        <p>开启青春畅享+后您的账号会自动进入青少年模式，无法取消。（订阅计划结束后会自动取消）</p>
        <p>当您拥有青春畅享+时，在购买时会自动弹出相关选项，请您知悉。</p>
        <p>青春畅享+权益需要每年验证来确保有效性，当您违反我们的相关协议时，您的青春畅享+权益会被自动取消。</p>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>
