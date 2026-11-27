package com.shangzhen.workbench;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** 导入表头由配置决定：app.performance-import.columns.<字段> 改了就按新的列名认，没改的字段用 application.yml 里的默认值。 */
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:importcolumns;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","app.storage=./target/importcolumns-media","app.worker-delay=3600000",
    "app.storyboard.poll-delay=3600000","app.product-analysis.poll-delay=3600000","app.remake-draft.poll-delay=3600000","app.suggestions.cron=-",
    "app.performance-import.columns.cost=投放花费,花费金额","app.performance-import.columns.refund-rate-1h=退款率（1h）"})
class ImportColumnsConfigTest {
    @Autowired PerformanceService perf;

    @Test void headersComeFromConfiguration() {
        Map<String,Integer> m=PerformanceService.guess(List.of("素材ID","素材名称","统计日期","投放花费","成交金额","退款率(1h)","消耗"),perf.columns());
        assertThat(m).containsEntry("materialId",0).containsEntry("adName",1).containsEntry("date",2).containsEntry("cost",3).containsEntry("gmv",4).containsEntry("refundRate1h",5);
        assertThat(m).doesNotContainValue(6); // 「消耗」被配置换掉了，不再认
        // application.yml 里写了的默认列名照常生效
        assertThat(PerformanceService.guess(List.of("智能优惠券金额","退款订单数"),perf.columns())).containsEntry("coupon",0).containsEntry("refundOrders",1);
    }
}
