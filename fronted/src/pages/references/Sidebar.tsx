import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Play, Plus } from 'lucide-react';
import { useWorkspace } from '../../components/UI';
import { FolderGroup } from '../../gy/folders';
import { inFolder, useReferenceLibrary, useRefreshReferences } from './data';

/** 参考视频库左栏：上传入口 + 文件夹（规则同商品库）。 */
export default function ReferenceSidebar() {
  const { client } = useWorkspace();
  const { folders, refs } = useReferenceLibrary();
  const refresh = useRefreshReferences();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onList = pathname === '/references' || pathname === '/references/';
  const current = onList ? (params.get('folder') ?? 'all') : '';
  const go = (folder: string) =>
    navigate(folder === 'all' ? '/references' : `/references?folder=${encodeURIComponent(folder)}`);
  const used = refs.filter((r) => r.usedBy.length).length;
  const folderParam =
    current && current !== 'all' && current !== 'unfiled' ? `&folder=${current}` : '';
  return (
    <>
      <button
        type="button"
        className="gy-side-new"
        title="上传参考视频"
        onClick={() => navigate(`/references?upload=1${folderParam}`)}
      >
        <Plus size={16} aria-hidden="true" />
        <span className="lbl">上传参考视频</span>
      </button>
      <nav className="gy-snav" aria-label="参考视频文件夹">
        <FolderGroup
          folders={folders}
          current={current}
          onSelect={go}
          all={{
            label: '全部参考视频',
            icon: <Play size={16} aria-hidden="true" />,
            count: refs.length,
          }}
          count={(id) => inFolder(refs, folders, id).length}
          unfiled={refs.filter((r) => !r.folderId).length}
          endpoint={`/clients/${client.id}/reference-folders`}
          onChanged={refresh}
        />
      </nav>
      <div className="gy-side-foot">
        <b>参考视频库</b>
        {refs.length} 条 · {used ? `${used} 条用在项目里` : '还没有用在项目里'}
      </div>
    </>
  );
}
