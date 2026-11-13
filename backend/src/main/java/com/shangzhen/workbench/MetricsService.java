package com.shangzhen.workbench;

import org.apache.commons.csv.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import java.io.*;
import java.math.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
public class MetricsService {
    private final Store s;
    public MetricsService(Store s) {this.s=s;}
    @Transactional public int importCsv(String client,String user,MultipartFile file) throws IOException {
        if(file.getSize()>2*1024*1024)throw Store.bad("报表不得超过 2MB");
        String text=new String(file.getBytes(),StandardCharsets.UTF_8).replaceFirst("^\\uFEFF","");
        var format=CSVFormat.DEFAULT.builder().setHeader().setSkipHeaderRecord(true).setIgnoreEmptyLines(true).get();
        try(var csv=CSVParser.parse(text,format)) {
            if(!csv.getHeaderNames().equals(List.of("materialId","impressions","clicks","spend","orders","revenue")))throw Store.bad("CSV 表头须为 materialId,impressions,clicks,spend,orders,revenue");
            int count=0;Set<String> seen=new HashSet<>();
            for(CSVRecord row:csv) {
                if(++count>10000) throw Store.bad("最多导入 10000 行");
                String id=row.get("materialId").strip();
                long impressions=Long.parseLong(row.get("impressions")),clicks=Long.parseLong(row.get("clicks")),orders=Long.parseLong(row.get("orders"));
                BigDecimal spend=new BigDecimal(row.get("spend")),revenue=new BigDecimal(row.get("revenue"));
                if(id.isBlank()||id.length()>150||!seen.add(id)||impressions<0||clicks<0||orders<0||clicks>impressions||orders>clicks||spend.signum()<0||revenue.signum()<0||spend.precision()>16||revenue.precision()>16||spend.scale()>2||revenue.scale()>2)throw Store.bad("第 "+(row.getRecordNumber()+1)+" 行数据不合法或素材 ID 重复");
                s.db.update("DELETE FROM metrics WHERE client_id=? AND material_id=?",client,id);
                s.db.update("INSERT INTO metrics VALUES(?,?,?,?,?,?,?,?)",Store.id(),client,id,impressions,clicks,spend,orders,revenue);
            }
            if(count==0)throw Store.bad("报表没有数据");
            s.audit(client,user,"导入投放报表",count+" 行，按素材 ID 覆盖");return count;
        }catch(NumberFormatException|ArrayIndexOutOfBoundsException e){throw Store.bad("CSV 数字或列数不正确");}
    }
    public Map<String,Object> report(String client) {
        var rows=s.db.queryForList("SELECT material_id AS \"materialId\",impressions,clicks,spend,orders,revenue FROM metrics WHERE client_id=? ORDER BY spend DESC",client);
        BigDecimal spend=BigDecimal.ZERO,revenue=BigDecimal.ZERO;long impressions=0,clicks=0,orders=0;
        for(var row:rows) {spend=spend.add((BigDecimal)row.get("spend"));revenue=revenue.add((BigDecimal)row.get("revenue"));impressions+=((Number)row.get("impressions")).longValue();clicks+=((Number)row.get("clicks")).longValue();orders+=((Number)row.get("orders")).longValue();}
        Map<String,Object> summary=new LinkedHashMap<>();summary.put("impressions",impressions);summary.put("clicks",clicks);summary.put("orders",orders);summary.put("spend",spend);summary.put("revenue",revenue);
        summary.put("ctr",impressions==0?null:(double)clicks/impressions);summary.put("cpa",orders==0?null:spend.divide(BigDecimal.valueOf(orders),2,RoundingMode.HALF_UP));summary.put("roas",spend.signum()==0?null:revenue.divide(spend,2,RoundingMode.HALF_UP));
        return Map.of("summary",summary,"rows",rows);
    }
}
